export type RewardPolicy = 'DRAFT' | 'APPROVED';
export type PetRewardState = Readonly<{ policy: RewardPolicy; claimedToday: boolean; balance: number }>;

export const initialPetRewardState: PetRewardState = { policy: 'DRAFT', claimedToday: false, balance: 0 };

export function claimDailyReward(state: PetRewardState): PetRewardState {
  if (state.policy !== 'APPROVED' || state.claimedToday) return state;
  return { ...state, claimedToday: true, balance: state.balance + 1 };
}

export function resetDailyClaim(state: PetRewardState): PetRewardState {
  return { ...state, claimedToday: false };
}
