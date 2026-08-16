import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { spacing } from '../../ui/design-tokens';
import { buttonStyle, buttonTextStyle, surface, text } from '../../ui/ui-kit';

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
  return <View style={{ ...surface.card, marginVertical: spacing.xs, gap: spacing.sm }}>
    <View style={{ gap: 4 }}>
      <Text style={text.subtitle}>일일 무료 뽑기</Text>
      <Text style={text.caption}>등장 확률: 일반 60% · 고급 25% · 희귀 10% · 영웅 4% · 전설 1%</Text>
      {policyBlocked && <Text testID="draw-policy-reason" style={text.caption}>보상 정책 승인 후 사용 가능</Text>}
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
  </View>;
}
