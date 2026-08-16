import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { spacing } from '../../ui/design-tokens';
import { badgeStyle, badgeTextStyle, buttonStyle, buttonTextStyle, surface, text } from '../../ui/ui-kit';

export type CoachArchetype = 'SCOUT' | 'LINGUIST' | 'SAGE' | 'CHEER';

export type PetCoachProps = {
  petName: string;
  level: number;
  archetype: CoachArchetype;
  remainingCharges: number;
  onUseCoach?: () => void;
};

export function PetCoach({ petName, level, archetype, remainingCharges, onUseCoach }: PetCoachProps) {
  const coachLabel = archetype === 'SCOUT' ? '시각 조망'
    : archetype === 'LINGUIST' ? '언어 예문'
    : archetype === 'SAGE' ? '뜻풀이' : '응원';
  const available = remainingCharges > 0;
  const tone = available ? 'primary' : 'disabled';

  return (
    <View style={{ ...surface.card, padding: spacing.md, marginVertical: 6, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 }}>
          <Text numberOfLines={1} style={text.subtitle}>{petName}</Text>
          <View style={badgeStyle('neutral')}><Text style={badgeTextStyle('neutral')}>{`Lv.${level}`}</Text></View>
        </View>
        <Text style={text.caption}>{`코칭: ${coachLabel}`}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`코칭 도움 요청, 남은 도움 ${remainingCharges}회`}
        accessibilityState={{ disabled: !available }}
        disabled={!available}
        onPress={onUseCoach}
        style={buttonStyle(tone, { block: true })}
      >
        <Text style={buttonTextStyle(tone)}>
          {available ? `코칭 도움 받기 (남은 도움 ${remainingCharges}회)` : '오늘 코칭 완료'}
        </Text>
      </Pressable>
    </View>
  );
}
