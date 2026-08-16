import { describe, expect, it } from 'vitest';
import { claimDailyReward, initialPetRewardState, resetDailyClaim } from './pet-reward-controller';

describe('pet reward policy', () => {
  it('fails closed while policy is draft and is idempotent after approval', () => {
    expect(claimDailyReward(initialPetRewardState)).toEqual(initialPetRewardState);
    const approved = { ...initialPetRewardState, policy: 'APPROVED' as const };
    const claimed = claimDailyReward(approved);
    expect(claimed).toMatchObject({ claimedToday: true, balance: 1 });
    expect(claimDailyReward(claimed)).toEqual(claimed);
  });

  it('allows the next day only through an explicit reset', () => {
    const claimed = claimDailyReward({ policy: 'APPROVED', claimedToday: false, balance: 0 });
    expect(resetDailyClaim(claimed).claimedToday).toBe(false);
  });
});
