import { Text, View } from 'react-native';
import type { RankingModel } from './ranking-model';

const stateCopy = {
  LOADING: '랭킹을 불러오는 중이에요.',
  EMPTY: '아직 검증된 기록이 없어요.',
  STALE: '저장된 랭킹이에요. 연결되면 갱신할게요.',
  ERROR: '랭킹을 불러오지 못했어요.',
  DISABLED: '서버 검증과 주간 정책 승인 후 열려요.',
} as const;

export function RankingScreen({ model }: Readonly<{ model: RankingModel }>) {
  return <View accessibilityLabel={`랭킹 상태 ${model.state}`} style={{ gap: 12 }}>
    {model.state !== 'READY' && <Text accessibilityLiveRegion="polite">{stateCopy[model.state]}</Text>}
    {(model.state === 'READY' || model.state === 'STALE') && model.rows.map((row) =>
      <View key={`${row.rank}-${row.nickname}`} accessibilityLabel={`${row.rank}위 ${row.nickname} ${row.score}점`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
        <Text>{row.rank}위 · {row.nickname}</Text>
        <Text>{row.score.toLocaleString()}점</Text>
      </View>,
    )}
  </View>;
}
