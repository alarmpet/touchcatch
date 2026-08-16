import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../../ui/design-tokens';
import { text } from '../../ui/ui-kit';

export type ChampionStarsProps = { current: number; historical?: number };

export function formatChampionStars(current: number): string {
  return current <= 5 ? '★'.repeat(current) : `★×${current}`;
}

export const ChampionStars: React.FC<ChampionStarsProps> = ({ current, historical }) => <View accessibilityLabel={`현재 챔피언 별 ${current}개`} accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
  <Text style={{ color: colors.reward, fontSize: 16, lineHeight: 20, fontWeight: '700' }}>{formatChampionStars(current)}</Text>
  {historical !== undefined && <Text style={text.caption}>{`(누적 ${historical}개)`}</Text>}
</View>;
