import React from 'react';
import { View, Text } from 'react-native';

export type WeeklyCategoryBoardProps = {
  category: 'ENGLISH' | 'PROVERB';
  top10: readonly { rank: number; nickname: string; displayScore: number }[];
  myRank?: number;
};

export function WeeklyCategoryBoard({ category, top10, myRank }: WeeklyCategoryBoardProps) {
  return (
    <View style={{ padding: 14, backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginVertical: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: '#17324D' }}>
        주간 랭킹 챌린지 - {category}
      </Text>
      {myRank && (
        <Text style={{ fontSize: 13, color: '#0B7A75', fontWeight: '600', marginVertical: 4 }}>
          내 주간 순위: {myRank}위
        </Text>
      )}
      <View style={{ marginTop: 8 }}>
        {top10.map((item) => (
          <View key={item.rank} accessibilityLabel={`${item.rank}위 ${item.nickname} ${item.displayScore}점`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 13, fontWeight: item.rank <= 3 ? 'bold' : 'normal', color: '#17324D' }}>
              {item.rank}위 {item.nickname}
            </Text>
            <Text style={{ fontSize: 13, color: '#0B7A75', fontWeight: '600' }}>
              {item.displayScore.toLocaleString()}점
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
