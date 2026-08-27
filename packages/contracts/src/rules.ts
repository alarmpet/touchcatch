export type TieBreakRule = 'SCORE' | 'FINAL_PACKAGE_CORRECT' | 'HARD_DIFFERENCES' | 'FEWER_FINAL_ANSWER_ERRORS' | 'SUDDEN_DEATH';
export type RulesetV1 = {
  rulesetVersion: '1.0.0'; targetScore: number; scoreFloor: number;
  time: { assetLoadMs: number; countdownMs: number; playingMs: number; finalRushStartsAtMs: number; wordHuntMs: number; wordHuntRevealMs: number; meaningQuizMs: number; meaningSettlementCapMs: number; suddenDeathMs: number; reconnectForfeitMs: number };
  score: { normalDifference: number; hardDifference: number; finalRushDifferenceMultiplier: 2; normalWordHunt: number; specialWordHunt: number; finalWord: number; meaning: number; combo: number; wrongAnswer: number; finalRushWrongAnswer: number };
  lockMs: { wrongAnswer: number; finalRushWrongAnswer: number };
  wordHuntSchedule: readonly [{ kind: 'NORMAL'; spawnWindowMs: readonly [number, number] }, { kind: 'NORMAL'; spawnWindowMs: readonly [number, number] }, { kind: 'SPECIAL'; spawnAtMs: number }];
  limits: { maxBoardTapsPerSecond: number }; hint: { creditsPerWordHuntWin: 1; charactersPerUse: 1; revealOrder: 'MATCH_RANDOM_SCHEDULE' };
  content: { minDifferences: number; maxDifferences: number; hardDifferenceNumerator: number; hardDifferenceDenominator: number; wordHunts: 3 };
  finalChallenge: { unlock: { atMs: number; onDifferenceClaim: true; onWordHuntClaim: true }; maxWrongAttempts: 3; atomicScoring: true };
  tieBreak: readonly TieBreakRule[];
};
