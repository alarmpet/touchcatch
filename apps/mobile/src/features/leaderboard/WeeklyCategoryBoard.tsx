import React from 'react';
import { View, Text } from 'react-native';
import { colors, spacing } from '../../ui/design-tokens';
import { badgeStyle, badgeTextStyle, text } from '../../ui/ui-kit';

export type WeeklyCategoryBoardProps = {
  category: 'ENGLISH' | 'PROVERB';
  top10: readonly { rank: number; nickname: string; displayScore: number }[];
  myRank?: number;
};

export function WeeklyCategoryBoard({ category, top10, myRank }: WeeklyCategoryBoardProps) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text style={text.subtitle}>{`주간 랭킹 챌린지 - ${category}`}</Text>
        {myRank ? (
          <View style={badgeStyle('accent')}>
            <Text style={badgeTextStyle('accent')}>{`내 주간 순위: ${myRank}위`}</Text>
          </View>
        ) : null}
      </View>
      <View>
        {top10.map((item, index) => (
          <View
            key={item.rank}
            accessibilityLabel={`${item.rank}위 ${item.nickname} ${item.displayScore}점`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: spacing.sm,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.line,
              gap: spacing.sm,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
              <Text style={{ ...text.caption, width: 28, fontWeight: '700', color: item.rank <= 3 ? colors.accent : colors.faint }}>
                {item.rank}
              </Text>
              <Text numberOfLines={1} style={{ ...text.bodyStrong, flex: 1 }}>{item.nickname}</Text>
            </View>
            <Text style={text.caption}>{`${item.displayScore.toLocaleString()}점`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
