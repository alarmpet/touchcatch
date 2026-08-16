import { describe, it, expect } from 'vitest';
import { startRankedAttemptSession } from './attempt-session.js';
import { verifyRankedAttempt, calculateDisplayScore } from './attempt-verifier.js';

describe('learning-competition pure package', () => {
  it('starts a ranked session with OPEN status and BEST_COMPLETED_VERIFIED rule', () => {
    const session = startRankedAttemptSession({
      subjectKey: 'user-uuid-1',
      seasonId: 'season-2026-w31',
      category: 'ENGLISH',
      contentRevisionId: 'rev-1',
      selectedUserPetId: 'pet-uuid-1',
      rulesetHash: 'hash1',
      hintPolicyHash: 'hash2',
      competitionPolicyHash: 'hash3',
    }, 1000);

    expect(session.status).toBe('OPEN');
    expect(session.rankedRecord).toBe('BEST_COMPLETED_VERIFIED');
    expect(session.attemptId).toBeDefined();
  });

  it('calculates official display score with time and hint penalties', () => {
    const score = calculateDisplayScore({
      completionMs: 42000,
      wrongTaps: 1,
      wrongAnswers: 0,
      hintsUsed: 0,
    });
    // 100000 - 14000 (time penalty) - 3000 (1 tap miss) = 83000
    expect(score).toBe(83000);
  });

  it('quarantines attempts under 500 ms', () => {
    const result = verifyRankedAttempt({
      startedAtMs: 1000,
      assetsReadyAtMs: 1000,
      completedAtMs: 1200, // 200ms < 500ms
      events: [],
      hintsUsed: 0,
      wrongTaps: 0,
      wrongAnswers: 0,
    });

    expect(result.verificationStatus).toBe('QUARANTINED');
    expect(result.displayScore).toBe(0);
  });
});
