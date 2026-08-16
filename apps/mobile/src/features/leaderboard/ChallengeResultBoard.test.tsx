import { describe, it, expect } from 'vitest';
import { ChallengeResultBoard } from './ChallengeResultBoard';

describe('ChallengeResultBoard Component logic', () => {
  it('formats result board values correctly', () => {
    const props = {
      thisAttemptScore: 85000,
      myBestScore: 92000,
      myRank: 143,
      totalCompetitors: 812,
      percentile: 18,
    };

    expect(props.thisAttemptScore).toBe(85000);
    expect(props.myBestScore).toBe(92000);
    expect(props.myRank).toBe(143);
  });
});
