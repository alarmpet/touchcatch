import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, Text, View } from 'react-native';
import { colors, onDark, radius, rarityGradients, rarityLabels, spacing, type RarityKey } from '../../ui/design-tokens';
import { Sheen, VerticalGradient } from '../../ui/Gradient';
import { buttonStyle, buttonTextStyle } from '../../ui/ui-kit';
import { PetRarityAura } from './PetRarityAura';

const AnimatedView = Animated?.View ?? View;

export type PetPromotionFXProps = Readonly<{
  petName: string;
  previousRarity: RarityKey;
  newRarity: RarityKey;
  artUrl?: string | undefined;
  onDismiss: () => void;
}>;

function InwardStarParticle({ index }: { index: number }) {
  const ValueClass = Animated?.Value ?? class { setValue() {} interpolate() { return 0; } };
  const anim = useRef(new ValueClass(0)).current;
  const angle = (index * (360 / 10)) * (Math.PI / 180);
  const startDistance = 140;
  const startX = Math.cos(angle) * startDistance;
  const startY = Math.sin(angle) * startDistance;

  useEffect(() => {
    if (typeof Animated?.timing === 'function') {
      Animated.timing(anim, {
        toValue: 1,
        duration: 700 + (index % 3) * 100,
        useNativeDriver: true,
      }).start();
    }
  }, [anim, index]);

  const translateX = typeof anim?.interpolate === 'function'
    ? anim.interpolate({
        inputRange: [0, 1],
        outputRange: [startX, 0],
      })
    : 0;

  const translateY = typeof anim?.interpolate === 'function'
    ? anim.interpolate({
        inputRange: [0, 1],
        outputRange: [startY, 0],
      })
    : 0;

  const scale = typeof anim?.interpolate === 'function'
    ? anim.interpolate({
        inputRange: [0, 0.7, 1],
        outputRange: [0.5, 1.4, 0.1],
      })
    : 1;

  const opacity = typeof anim?.interpolate === 'function'
    ? anim.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0, 1, 1, 0],
      })
    : 0;

  return (
    <AnimatedView
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FBBF24',
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

export function PetPromotionFX({
  petName,
  previousRarity,
  newRarity,
  artUrl,
  onDismiss,
}: PetPromotionFXProps) {
  const ramp = rarityGradients[newRarity];
  const ValueClass = Animated?.Value ?? class { setValue() {} interpolate() { return 0; } };
  const pulseAnim = useRef(new ValueClass(0.5)).current;
  const bannerScale = useRef(new ValueClass(0.3)).current;

  useEffect(() => {
    if (typeof Animated?.sequence === 'function' && typeof Animated?.spring === 'function' && typeof Animated?.timing === 'function') {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.spring(bannerScale, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [pulseAnim, bannerScale]);

  const scale = typeof bannerScale?.interpolate === 'function' ? bannerScale : 1;

  return (
    <View
      testID="pet-promotion-fx"
      accessibilityRole="alert"
      accessibilityLabel={`${petName} 승급 완료: ${rarityLabels[previousRarity]}에서 ${rarityLabels[newRarity]}으로 상승`}
      style={{
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderRadius: radius.xl,
        borderWidth: 2,
        borderColor: ramp.via,
        marginVertical: spacing.sm,
        gap: spacing.md,
      }}
    >
      {/* 1. Inward Ascension Particles */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <InwardStarParticle key={`inward-star-${i}`} index={i} />
        ))}
      </View>

      {/* 2. Headline Tier Up Banner */}
      <AnimatedView
        style={{
          alignItems: 'center',
          gap: 2,
          transform: [{ scale }],
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.5, color: '#FBBF24' }}>
          ✦ TIER UPGRADED ✦
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '900', color: onDark.primary }}>
          승급 성공!
        </Text>
      </AnimatedView>

      {/* 3. Upgraded Pet Medallion with Aura */}
      <PetRarityAura rarity={newRarity} active size={120}>
        <VerticalGradient
          from={ramp.from}
          via={ramp.via}
          to={ramp.to}
          style={{
            width: 110,
            height: 110,
            borderRadius: radius.xl,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 3,
          }}
        >
          <Sheen size={110} top={-40} left={-20} opacity={0.35} />
          <View
            style={{
              flex: 1,
              width: '100%',
              borderRadius: radius.xl - 2,
              backgroundColor: colors.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {artUrl ? (
              <Image
                accessibilityLabel={`${petName} 이미지`}
                source={{ uri: artUrl }}
                resizeMode="cover"
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              <Text style={{ fontSize: 44 }}>👑</Text>
            )}
          </View>
        </VerticalGradient>
      </PetRarityAura>

      {/* 4. Evolution Arrow Info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: onDark.secondary }}>
          {rarityLabels[previousRarity]}
        </Text>
        <Text style={{ fontSize: 16, fontWeight: '900', color: ramp.via }}>
          ➔
        </Text>
        <View
          style={{
            backgroundColor: ramp.via,
            paddingHorizontal: spacing.sm,
            paddingVertical: 3,
            borderRadius: radius.pill,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: onDark.primary }}>
            {rarityLabels[newRarity]}
          </Text>
        </View>
      </View>

      {/* 5. Dismiss Button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="승급 확인"
        onPress={onDismiss}
        style={{ ...buttonStyle('primary', { block: true }), minHeight: 44, width: '100%' }}
      >
        <Text style={buttonTextStyle('primary')}>멋져요!</Text>
      </Pressable>
    </View>
  );
}
