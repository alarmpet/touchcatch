import React, { useEffect, useRef } from 'react';
import { Animated, type StyleProp, View, type ViewStyle } from 'react-native';
import { neonPulseGlow, rarityAuraTokens, type RarityKey } from '../../ui/design-tokens';

const AnimatedView = Animated?.View ?? View;

export type PetRarityAuraProps = Readonly<{
  rarity: RarityKey;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  size?: number;
}>;

function SunburstRay({ angle, color }: { angle: number; color: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 140,
        height: 2,
        backgroundColor: color,
        opacity: 0.2,
        transform: [
          { translateX: -70 },
          { translateY: -1 },
          { rotate: `${angle}deg` },
        ],
      }}
    />
  );
}

function AuraSparkle({ index, color }: { index: number; color: string }) {
  const anim = useRef(new (Animated?.Value ?? class { setValue() {} interpolate() { return 0; } })(0)).current;
  const size = 3 + (index % 3) * 2;
  const offsetX = (index % 5 - 2) * 24;
  const offsetY = (index % 4 - 2) * 22;

  useEffect(() => {
    if (typeof Animated?.loop === 'function' && typeof Animated?.sequence === 'function' && typeof Animated?.timing === 'function') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 800 + index * 150,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 800 + index * 150,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [anim, index]);

  const scale = typeof anim?.interpolate === 'function'
    ? anim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.3, 1.2, 0.3],
      })
    : 1;

  const opacity = typeof anim?.interpolate === 'function'
    ? anim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.1, 0.85, 0.1],
      })
    : 0.8;

  return (
    <AnimatedView
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [
          { translateX: offsetX },
          { translateY: offsetY },
          { scale },
        ],
      }}
    />
  );
}

export function PetRarityAura({
  rarity,
  children,
  style,
  active = true,
  size,
}: PetRarityAuraProps) {
  const config = rarityAuraTokens[rarity] ?? rarityAuraTokens.COMMON;
  const rotateAnim = useRef(new (Animated?.Value ?? class { setValue() {} interpolate() { return 0; } })(0)).current;

  useEffect(() => {
    if (config.hasRays && active && typeof Animated?.loop === 'function' && typeof Animated?.timing === 'function') {
      const rayLoop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 12000,
          useNativeDriver: true,
        })
      );
      rayLoop.start();
      return () => rayLoop.stop();
    }
  }, [config.hasRays, active, rotateAnim]);

  const rayRotation = typeof rotateAnim?.interpolate === 'function'
    ? rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
      })
    : '0deg';

  return (
    <View
      testID="pet-rarity-aura"
      style={[
        {
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
        },
        size !== undefined ? { width: size, height: size } : null,
        active ? neonPulseGlow(config.primaryColor, config.glowIntensity) : null,
        style,
      ]}
    >
      {/* 1. Rotating Sunburst Rays (Epic / Legendary) */}
      {config.hasRays && active ? (
        <AnimatedView
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: rayRotation }],
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SunburstRay key={`ray-${i}`} angle={i * 45} color={config.primaryColor} />
          ))}
        </AnimatedView>
      ) : null}

      {/* 2. Ambient Stardust Sparkles (Uncommon, Rare, Epic, Legendary) */}
      {config.hasParticles && active ? (
        <View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <AuraSparkle key={`sparkle-${i}`} index={i} color={config.primaryColor} />
          ))}
        </View>
      ) : null}

      {/* 3. Child Content */}
      {children}
    </View>
  );
}
