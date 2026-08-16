import { startRankedAttemptSession, RankedAttemptSessionInput, RankedAttemptSession } from '@spot-learn/learning-competition';

export class AttemptSessionAdapter {
  startSession(input: RankedAttemptSessionInput, serverNowMs: number = Date.now()): RankedAttemptSession {
    return startRankedAttemptSession(input, serverNowMs);
  }
}
