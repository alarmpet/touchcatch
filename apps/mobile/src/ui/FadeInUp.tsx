import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type ViewStyle } from 'react-native';

/**
 * Fades a block in and lifts it a few pixels on mount.
 *
 * The home screen was completely static, which made a screen full of zero-states read as a
 * screenshot rather than an app. A short stagger down the page gives the eye an order to
 * follow — hero, then the row you pick from, then the collection.
 *
 * Deliberately small: 12px and under 300ms. Anything longer turns a daily-open app into a
 * daily wait, and the animation is between the player and the button they came to press.
 */

/** Per-index delay for a staggered group. Kept short enough that the last item is not late. */
export const STAGGER_MS = 70;

const DURATION_MS = 260;
const TRAVEL = 12;

export function FadeInUp({ delay = 0, style, children }: Readonly<{
  delay?: number;
  style?: ViewStyle;
  children: ReactNode;
}>) {
  // One driver for both properties: opacity and translate always move together, and a single
  // value means a single native animation rather than two racing ones.
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop?.();
  }, [delay, progress]);

  return <Animated.View style={{
    ...style,
    opacity: progress,
    transform: [{
      translateY: progress.interpolate?.({ inputRange: [0, 1], outputRange: [TRAVEL, 0] }) ?? 0,
    }],
  }}>
    {children}
  </Animated.View>;
}
