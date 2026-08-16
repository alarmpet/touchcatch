export type AttemptCommandEvent = {
  type: string;
  timestampMs: number;
  payload?: any;
};

export type VerificationInput = {
  startedAtMs: number;
  assetsReadyAtMs: number;
  completedAtMs: number;
  events: AttemptCommandEvent[];
  hintsUsed: number;
  wrongTaps: number;
  wrongAnswers: number;
};

export type VerifiedAttemptResult = {
  completionMs: number;
  displayScore: number;
  hintsUsed: number;
  wrongTaps: number;
  wrongAnswers: number;
  verificationStatus: 'COMPLETED_VERIFIED' | 'QUARANTINED';
};

export function calculateDisplayScore(input: {
  completionMs: number;
  wrongTaps: number;
  wrongAnswers: number;
  hintsUsed: number;
}): number {
  const timePenalty = Math.min(30_000, Math.floor(input.completionMs / 3));
  return Math.max(
    0,
    100_000 -
      timePenalty -
      input.wrongTaps * 3_000 -
      input.wrongAnswers * 10_000 -
      input.hintsUsed * 15_000
  );
}

export function verifyRankedAttempt(input: VerificationInput): VerifiedAttemptResult {
  const completionMs = input.completedAtMs - input.assetsReadyAtMs;

  // Anti-cheat & Quarantine rules
  if (completionMs < 500 || input.completedAtMs < input.startedAtMs) {
    return {
      completionMs: Math.max(0, completionMs),
      displayScore: 0,
      hintsUsed: input.hintsUsed,
      wrongTaps: input.wrongTaps,
      wrongAnswers: input.wrongAnswers,
      verificationStatus: 'QUARANTINED',
    };
  }

  const displayScore = calculateDisplayScore({
    completionMs,
    wrongTaps: input.wrongTaps,
    wrongAnswers: input.wrongAnswers,
    hintsUsed: input.hintsUsed,
  });

  return {
    completionMs,
    displayScore,
    hintsUsed: input.hintsUsed,
    wrongTaps: input.wrongTaps,
    wrongAnswers: input.wrongAnswers,
    verificationStatus: 'COMPLETED_VERIFIED',
  };
}
