import { verifyRankedAttempt, VerificationInput, VerifiedAttemptResult } from '@spot-learn/learning-competition';

export class AttemptVerifierAdapter {
  verifyAttempt(input: VerificationInput): VerifiedAttemptResult {
    return verifyRankedAttempt(input);
  }
}
