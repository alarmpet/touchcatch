import React from 'react';
import { colors } from '../../ui/design-tokens';

export type LeaderboardEntry = {
  rank: number;
  nickname: string;
  displayScore: number;
  completionMs: number;
  hintsUsed: number;
};

export type ChallengeResultBoardProps = {
  thisAttemptScore: number;
  myBestScore?: number;
  top10: LeaderboardEntry[];
  myRank?: number;
  totalCompetitors?: number;
  percentile?: number;
};

export const ChallengeResultBoard: React.FC<ChallengeResultBoardProps> = ({
  thisAttemptScore,
  myBestScore,
  top10,
  myRank,
  totalCompetitors,
  percentile,
}) => {
  return (
    <div style={{ padding: 20, color: colors.ink, maxWidth: 520 }}>
      <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3, margin: '0 0 16px' }}>결과 리더보드</h3>

      <div style={{ padding: 16, backgroundColor: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 18, marginBottom: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: colors.faint, margin: 0 }}>THIS ATTEMPT</p>
        <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.6, margin: '4px 0 0' }}>{thisAttemptScore.toLocaleString()}점</p>
        {myBestScore !== undefined ? (
          <p style={{ fontSize: 13, fontWeight: 700, color: colors.accent, margin: '8px 0 0' }}>
            내 최고 기록: {myBestScore.toLocaleString()}점
          </p>
        ) : null}
        {myRank && totalCompetitors ? (
          <p style={{ fontSize: 13, color: colors.muted, margin: '4px 0 0' }} aria-label="내 순위 정보">
            {myRank}위 / {totalCompetitors}명 {percentile ? `(상위 ${percentile}%)` : ''}
          </p>
        ) : null}
      </div>

      <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: colors.faint, margin: '0 0 8px' }}>TOP 10</h4>
      <div>
        {top10.map((item) => (
          <div key={item.rank} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${colors.line}` }}>
            <span style={{ width: 28, fontWeight: 700, fontSize: 13, color: item.rank <= 3 ? colors.accent : colors.faint }}>{item.rank}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{item.nickname}</span>
            <span style={{ fontSize: 13, color: colors.muted }}>{item.displayScore.toLocaleString()}점</span>
          </div>
        ))}
      </div>
    </div>
  );
};
