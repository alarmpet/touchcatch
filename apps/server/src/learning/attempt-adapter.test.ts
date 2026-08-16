import { describe, it, expect } from 'vitest';
import { AttemptSessionAdapter } from './attempt-session.js';
import { AttemptVerifierAdapter } from './attempt-verifier.js';
import { AttemptRepository } from './attempt-repository.js';
import { createSqlRpcClient } from './sql-rpc-client.js';

describe('apps/server learning adapters', () => {
  it('delegates session start to learning-competition package', () => {
    const adapter = new AttemptSessionAdapter();
    const session = adapter.startSession({
      subjectKey: 'user-1',
      seasonId: 'season-1',
      category: 'ENGLISH',
      contentRevisionId: 'rev-1',
      selectedUserPetId: 'pet-1',
      rulesetHash: 'r1',
      hintPolicyHash: 'h1',
      competitionPolicyHash: 'c1',
    }, 1000);

    expect(session.status).toBe('OPEN');
    expect(session.category).toBe('ENGLISH');
  });

  it('delegates verification and repository commit', async () => {
    const verifier = new AttemptVerifierAdapter();
    const result = verifier.verifyAttempt({
      startedAtMs: 1000,
      assetsReadyAtMs: 1000,
      completedAtMs: 31000,
      events: [],
      hintsUsed: 0,
      wrongTaps: 0,
      wrongAnswers: 0,
    });

    expect(result.verificationStatus).toBe('COMPLETED_VERIFIED');

    const repo = new AttemptRepository();
    const commit = await repo.commitAttempt({
      attemptId: 'att-1',
      subjectKey: 'user-1',
      seasonId: 'season-1',
      category: 'ENGLISH',
      contentRevisionId: 'rev-1',
      selectedUserPetId: 'pet-1',
      verifiedResult: result,
    });

    expect(commit.committed).toBe(true);
  });

  it('only replaces a subject best record when the verified rank tuple improves', async () => {
    const repo = new AttemptRepository();
    const baseline = {
      attemptId: 'att-best', subjectKey: 'user-1', seasonId: 'season-1', category: 'ENGLISH',
      contentRevisionId: 'rev-1', selectedUserPetId: 'pet-1',
      verifiedResult: {
        verificationStatus: 'COMPLETED_VERIFIED' as const,
        completionMs: 20_000, displayScore: 90_000, hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0,
      },
    };
    expect((await repo.commitAttempt(baseline)).isBestRecord).toBe(true);
    expect((await repo.commitAttempt({
      ...baseline,
      attemptId: 'att-worse',
      verifiedResult: { ...baseline.verifiedResult, displayScore: 80_000 },
    })).isBestRecord).toBe(false);
    expect((await repo.commitAttempt({
      ...baseline,
      attemptId: 'att-better',
      verifiedResult: { ...baseline.verifiedResult, displayScore: 95_000 },
    })).isBestRecord).toBe(true);
  });

  it('maps commit arguments to the SQL RPC boundary', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const repo = new AttemptRepository(createSqlRpcClient(async (name, args) => {
      calls.push({ name, args });
      return { committed: true, isBestRecord: true };
    }));
    const verifiedResult = {
      verificationStatus: 'COMPLETED_VERIFIED' as const,
      completionMs: 1000, displayScore: 99, hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0,
    };
    await repo.commitAttempt({ attemptId: 'a1', subjectKey: 'u1', seasonId: 's1', category: 'ENGLISH', contentRevisionId: 'r1', selectedUserPetId: 'p1', verifiedResult });
    expect(calls[0]).toEqual({ name: 'private.commit_learning_attempt_v1', args: expect.objectContaining({ attempt_id: 'a1', subject_key: 'u1', verified_result: verifiedResult }) });
  });
});
