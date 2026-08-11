import React from 'react';
import { View, Text, Pressable } from 'react-native';

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
  return <View style={{ padding: 14, backgroundColor: '#FFF', borderRadius: 8, marginVertical: 8 }}>
    <Text style={{ fontSize: 16, fontWeight: '700', color: '#17324D' }}>일일 무료 뽑기</Text>
    <Text style={{ fontSize: 12, color: '#64748B', marginVertical: 4 }}>등장 확률: Common 80% · Rare 18% · Legendary 2%</Text>
    {policyBlocked && <Text testID="draw-policy-reason" style={{ color: '#64748B', marginBottom: 8 }}>보상 정책 승인 후 사용 가능</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onClaimDraw} style={{ paddingVertical: 10, backgroundColor: disabled ? '#CBD5E1' : '#0B7A75', borderRadius: 6, alignItems: 'center' }}>
      <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{label}</Text>
    </Pressable>
  </View>;
}
