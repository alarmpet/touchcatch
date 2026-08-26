import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { neon, neonPulseGlow } from './design-tokens';

export type HitSpark = Readonly<{
  id: string;
  x: number;
  y: number;
  color?: string | undefined;
}>;

export type WordFlight = Readonly<{
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  label: string;
}>;

export type InGameFXOverlayProps = Readonly<{
  hitSparks?: readonly HitSpark[] | undefined;
  comboLevel?: number | undefined; // 0, 1, 2, 3, 5+
  wordFlights?: readonly WordFlight[] | undefined;
  showVictoryConfetti?: boolean | undefined;
}>;

const CONFETTI_COLORS = ['#FFD700', '#00F0FF', '#FF3366', '#A855F7', '#10B981', '#FF9900'];

function ConfettiPiece({ index }: { index: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const startX = useRef(80 + (index % 7) * 40).current;
  const targetX = useRef(20 + (index % 9) * 40).current;
  const targetY = useRef(200 + (index % 8) * 50).current;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const size = 8 + (index % 6) * 2;

  useEffect(() => {
    if (typeof Animated.timing === 'function') {
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200 + (index % 5) * 200,
        useNativeDriver: true,
      }).start();
    }
  }, [anim, index]);

  const translateY = anim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [300, 100 - (index % 4) * 20, targetY],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, targetX],
  });

  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${(index % 2 === 0 ? 1 : -1) * 720}deg`],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 2,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate }],
      }}
    />
  );
}

function RippleEffect({ x, y, color = neon.gold }: { x: number; y: number; color?: string | undefined }) {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (typeof Animated.parallel === 'function' && typeof Animated.timing === 'function') {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 2.2,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute' as const,
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 3,
        backgroundColor: 'transparent',
        left: x - 32,
        top: y - 32,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

export function InGameFXOverlay({
  hitSparks = [],
  comboLevel = 0,
  wordFlights = [],
  showVictoryConfetti = false,
}: InGameFXOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (comboLevel >= 2 && typeof Animated.loop === 'function' && typeof Animated.sequence === 'function' && typeof Animated.timing === 'function') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 380, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    if (typeof pulseAnim.setValue === 'function') {
      pulseAnim.setValue(0);
    }
    return undefined;
  }, [comboLevel, pulseAnim]);

  const borderGlowColor = comboLevel >= 5
    ? neon.gold
    : comboLevel >= 3
      ? neon.purple
      : comboLevel >= 2
        ? neon.cyan
        : 'transparent';

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* 1. Combo Screen-Edge Neon Pulse */}
      {comboLevel >= 2 ? (
        <Animated.View
          style={{
            position: 'absolute' as const,
            top: 2,
            left: 2,
            right: 2,
            bottom: 2,
            borderWidth: 3,
            borderRadius: 16,
            borderColor: borderGlowColor,
            opacity: pulseAnim,
            ...neonPulseGlow(borderGlowColor, comboLevel >= 5 ? 'frenzy' : 'soft'),
          }}
        />
      ) : null}

      {/* 2. Hit Spark Ripples */}
      {hitSparks.map((spark) => (
        <RippleEffect key={spark.id} x={spark.x} y={spark.y} color={spark.color} />
      ))}

      {/* 3. Victory Confetti Burst */}
      {showVictoryConfetti ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <ConfettiPiece key={`confetti-${i}`} index={i} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
