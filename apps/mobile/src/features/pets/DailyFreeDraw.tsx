import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors, neon, neonPulseGlow, radius, spacing } from '../../ui/design-tokens';
import { GlassCard } from '../../ui/GlassCard';
import { buttonStyle, buttonTextStyle, text } from '../../ui/ui-kit';
import { drawOddsLine } from './draw-odds';

export type DailyFreeDrawProps = {
  hasClaimedToday: boolean;
  policy: 'DRAFT' | 'APPROVED';
  onClaimDraw?: () => void;
};

export function DailyFreeDraw({ hasClaimedToday, policy, onClaimDraw }: DailyFreeDrawProps) {
  const policyBlocked = policy !== 'APPROVED';
  const disabled = policyBlocked || hasClaimedToday;
  const label = policyBlocked
    ? '보상 정책 승인 후 사용 가능'
    : hasClaimedToday
      ? '오늘 무료 뽑기 완료'
      : '오늘 무료 뽑기 받기';
  const tone = disabled ? 'disabled' : 'primary';

  return (
    <GlassCard
      variant="hero"
      style={{
        marginVertical: spacing.xs,
        gap: spacing.sm,
        ...(disabled ? {} : neonPulseGlow(neon.purple, 'soft')),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.xl,
            backgroundColor: disabled ? colors.surfaceMuted : 'rgba(168, 85, 247, 0.2)',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: disabled ? colors.line : neon.purple,
          }}
        >
          <Text style={{ fontSize: 26 }}>{disabled ? '🎁' : '🔮'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={text.subtitle}>일일 무료 펫 뽑기</Text>
            {!disabled ? (
              <View
                style={{
                  backgroundColor: neon.purple,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: radius.pill,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>READY</Text>
              </View>
            ) : null}
          </View>
          <Text style={text.caption}>{drawOddsLine()}</Text>
          {policyBlocked && <Text testID="draw-policy-reason" style={text.caption}>보상 정책 승인 후 사용 가능</Text>}
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onClaimDraw}
        style={buttonStyle(tone, { block: true })}
      >
        <Text style={buttonTextStyle(tone)}>{label}</Text>
      </Pressable>
    </GlassCard>
  );
}

