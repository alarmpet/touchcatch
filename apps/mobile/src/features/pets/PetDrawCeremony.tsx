import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, Text, View } from 'react-native';
import { colors, onDark, radius, rarityGradients, rarityLabels, spacing, type RarityKey } from '../../ui/design-tokens';
import { Sheen, VerticalGradient } from '../../ui/Gradient';
import { PetRarityAura } from './PetRarityAura';

const AnimatedView = Animated?.View ?? View;

export type PetDrawCeremonyProps = Readonly<{
  rarity: RarityKey;
  petName: string;
  artUrl?: string | undefined;
  copies: number;
  opened: boolean;
  onSkip?: () => void;
}>;

const CAPSULE_ICONS: Readonly<Record<RarityKey, string>> = {
  COMMON: '🥚',
  UNCOMMON: '🌿',
  RARE: '💎',
  EPIC: '🔮',
  LEGENDARY: '👑',
};

export function PetDrawCeremony({
  rarity,
  petName,
  artUrl,
  copies,
  opened,
  onSkip,
}: PetDrawCeremonyProps) {
  const ramp = rarityGradients[rarity];
  const ValueClass = Animated?.Value ?? class { setValue() {} interpolate() { return 0; } };
  const dropAnim = useRef(new ValueClass(-60)).current;
  const scaleAnim = useRef(new ValueClass(0.8)).current;
  const shakeAnim = useRef(new ValueClass(0)).current;
  const shockwaveAnim = useRef(new ValueClass(0)).current;

  // Drop and bounce in
  useEffect(() => {
    if (typeof Animated?.spring === 'function') {
      Animated.spring(dropAnim, {
        toValue: 0,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [dropAnim]);

  // Shake during pending
  useEffect(() => {
    if (!opened && typeof Animated?.loop === 'function' && typeof Animated?.sequence === 'function' && typeof Animated?.timing === 'function') {
      const shake = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 3, duration: 60, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
      shake.start();
      return () => shake.stop();
    }
  }, [opened, shakeAnim]);

  // Open & Slam explosion
  useEffect(() => {
    if (opened) {
      if (typeof Animated?.spring === 'function') {
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 60,
          useNativeDriver: true,
        }).start();
      }
      if (typeof Animated?.timing === 'function') {
        if (typeof shockwaveAnim?.setValue === 'function') shockwaveAnim.setValue(0);
        Animated.timing(shockwaveAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();
      }
    }
  }, [opened, scaleAnim, shockwaveAnim]);

  const shockwaveScale = typeof shockwaveAnim?.interpolate === 'function'
    ? shockwaveAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.5, 2.4],
      })
    : 1;

  const shockwaveOpacity = typeof shockwaveAnim?.interpolate === 'function'
    ? shockwaveAnim.interpolate({
        inputRange: [0, 0.4, 1],
        outputRange: [0.9, 0.5, 0],
      })
    : 0;

  return (
    <Pressable
      testID="pet-draw-ceremony"
      accessibilityRole="button"
      accessibilityLabel={opened ? `${petName} ${rarityLabels[rarity]}` : '캡슐 개봉 중, 탭하여 즉시 확인'}
      onPress={opened ? undefined : onSkip}
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.lg,
        minHeight: 180,
      }}
    >
      {/* Shockwave Burst on Open */}
      {opened ? (
        <AnimatedView
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: 60,
            borderWidth: 3,
            borderColor: ramp.via,
            opacity: shockwaveOpacity,
            transform: [{ scale: shockwaveScale }],
          }}
        />
      ) : null}

      <AnimatedView
        style={{
          transform: [
            { translateY: dropAnim },
            { translateX: opened ? 0 : shakeAnim },
            { scale: scaleAnim },
          ],
        }}
      >
        <PetRarityAura rarity={rarity} active={opened} size={110}>
          <VerticalGradient
            from={ramp.from}
            via={ramp.via}
            to={ramp.to}
            style={{
              width: 100,
              height: 100,
              borderRadius: radius.xl,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 3,
              shadowColor: ramp.via,
              shadowOpacity: 0.6,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            <Sheen size={100} top={-40} left={-20} opacity={0.3} />
            <View
              style={{
                flex: 1,
                width: '100%',
                borderRadius: radius.xl - 2,
                backgroundColor: opened ? colors.surfaceMuted : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {opened && artUrl ? (
                <Image
                  accessibilityLabel={`${petName} 이미지`}
                  source={{ uri: artUrl }}
                  resizeMode="cover"
                  style={{ width: '100%', height: '100%' }}
                />
              ) : (
                <Text style={{ fontSize: opened ? 36 : 42 }}>
                  {opened ? (artUrl ? '' : '✨') : CAPSULE_ICONS[rarity]}
                </Text>
              )}
            </View>
          </VerticalGradient>
        </PetRarityAura>
      </AnimatedView>

      {!opened ? (
        <View style={{ marginTop: spacing.sm, alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: ramp.via }}>
            {`${rarityLabels[rarity]} 캡슐 개봉 중…`}
          </Text>
          <Text style={{ fontSize: 11, color: colors.faint }}>
            탭하면 즉시 확인
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: spacing.sm, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>
            {petName}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: ramp.via,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
              borderRadius: radius.pill,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: onDark.primary }}>
              {rarityLabels[rarity]}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: onDark.primary, opacity: 0.9 }}>
              {`· 보유 ${copies}개`}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
