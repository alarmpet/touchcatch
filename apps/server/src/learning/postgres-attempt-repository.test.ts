import { describe, expect, it, vi } from 'vitest';
import { PostgresAttemptRepository } from './postgres-attempt-repository.js';
import type { MobileRpcClient } from '../database/pg-rpc.js';

const attemptId = '50000000-0000-4000-8000-000000000001';
const subjectKey = '20000000-0000-4000-8000-000000000001';
const seasonId = '30000000-0000-4000-8000-000000000001';
const contentRevisionId = '40000000-0000-4000-8000-000000000001';
const idempotencyKey = '70000000-0000-4000-8000-000000000001';

const hashes = {
  contentHash: 'a'.repeat(64),
  rulesetHash: 'd'.repeat(64),
  hintPolicyHash: 'e'.repeat(64),
  competitionPolicyHash: 'c'.repeat(64),
};

function rpcReturning(response: unknown) {
  const calls: Array<{ name: string; args: readonly unknown[] }> = [];
  const rpc: MobileRpcClient = {
    call: vi.fn(),
    callParsed: vi.fn(async (name, args, parse) => {
      calls.push({ name, args });
      return parse(response);
    }),
  };
  return { rpc, calls };
}

describe('PostgresAttemptRepository', () => {
  it('binds start arguments in the exact order start_learning_attempt_v1 declares', async () => {
    const { rpc, calls } = rpcReturning({
      attemptId, status: 'OPEN',
      startedAt: '2026-08-14T00:00:00.000+00:00',
      expiresAt: '2026-08-14T00:15:00.000+00:00',
      contentRevisionId,
    });

    await new PostgresAttemptRepository(rpc).start({
      subjectKey, seasonId, contentRevisionId, idempotencyKey,
      requestHash: 'b'.repeat(64), petCatalogHash: 'f'.repeat(64), ...hashes,
    });

    expect(calls[0]?.name).toBe('start_learning_attempt_v1');
    expect(calls[0]?.args).toEqual([
      subjectKey, seasonId, contentRevisionId, idempotencyKey, 'b'.repeat(64), 'RANKED',
      hashes.contentHash, hashes.rulesetHash, hashes.hintPolicyHash, hashes.competitionPolicyHash, 'f'.repeat(64),
    ]);
  });

  it('binds assets-ready arguments and accepts both attestation shapes', async () => {
    const attested = rpcReturning({ attemptId, status: 'OPEN', assetsReadyAt: '2026-08-14T00:00:02.000+00:00' });
    await new PostgresAttemptRepository(attested.rpc).attestAssetsReady({ subjectKey, attemptId, ...hashes });
    expect(attested.calls[0]?.name).toBe('attest_learning_assets_ready_owned_v1');
    expect(attested.calls[0]?.args).toEqual([
      subjectKey, attemptId, hashes.contentHash, hashes.rulesetHash, hashes.hintPolicyHash, hashes.competitionPolicyHash,
    ]);

    const expired = rpcReturning({ attemptId, status: 'EXPIRED' });
    await expect(new PostgresAttemptRepository(expired.rpc).attestAssetsReady({ subjectKey, attemptId, ...hashes }))
      .resolves.toEqual({ attemptId, status: 'EXPIRED' });
  });

  it('binds commit arguments in the exact order commit_learning_attempt_v1 declares', async () => {
    const { rpc, calls } = rpcReturning({
      attemptId, status: 'COMPLETED_VERIFIED', completionMs: 30_000,
      acceptedAt: '2026-08-14T00:00:32.000+00:00', bestChanged: true,
    });

    await new PostgresAttemptRepository(rpc).commit({
      subjectKey, attemptId, idempotencyKey, requestHash: 'b'.repeat(64),
      displayScore: 69_000, hintsUsed: 1, wrongTaps: 2, wrongAnswers: 0,
      eventDigest: '9'.repeat(64), ...hashes,
    });

    expect(calls[0]?.name).toBe('commit_learning_attempt_owned_v1');
    expect(calls[0]?.args).toEqual([
      subjectKey, attemptId, idempotencyKey, 'b'.repeat(64),
      hashes.contentHash, hashes.rulesetHash, hashes.hintPolicyHash, hashes.competitionPolicyHash,
      69_000, 1, 2, 0, '9'.repeat(64),
    ]);
  });

  it('reads pinned challenges and refuses a payload carrying anything beyond public art', async () => {
    const challenge = {
      category: 'ENGLISH', ordinal: 1, contentRevisionId, contentHash: hashes.contentHash,
      imageA: { url: 'https://cdn.test/a.png', sha256: '1'.repeat(64), encodedBytes: 10, width: 8, height: 8, mimeType: 'image/png' },
      imageB: { url: 'https://cdn.test/b.png', sha256: '2'.repeat(64), encodedBytes: 10, width: 8, height: 8, mimeType: 'image/png' },
      differenceCount: 2, assistPattern: 'SPELLING', answerUnitCount: 3, spaceIndexes: [],
    };
    const season = { seasonId, startsAt: '2026-08-10T15:00:00.000+00:00', endsAt: '2026-08-17T15:00:00.000+00:00', attemptTtlSeconds: 900 };

    const ok = rpcReturning({ ...season, challenges: [challenge] });
    await expect(new PostgresAttemptRepository(ok.rpc).readChallenges({ subjectKey, seasonId }))
      .resolves.toMatchObject({ seasonId, challenges: [{ contentRevisionId }] });
    expect(ok.calls[0]?.name).toBe('read_weekly_challenges_v1');
    expect(ok.calls[0]?.args).toEqual([subjectKey, seasonId]);

    // A revision that leaked solution material must not be handed to the client.
    const leaky = rpcReturning({ ...season, challenges: [{ ...challenge, canonicalAnswer: 'cat' }] });
    await expect(new PostgresAttemptRepository(leaky.rpc).readChallenges({ subjectKey, seasonId })).rejects.toThrow();
  });

  it('refuses a response that does not match the pinned public shape', async () => {
    const { rpc } = rpcReturning({ attemptId, status: 'COMPLETED_VERIFIED', completionMs: 30_000, bestChanged: true });
    await expect(new PostgresAttemptRepository(rpc).commit({
      subjectKey, attemptId, idempotencyKey, requestHash: 'b'.repeat(64),
      displayScore: 1, hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0,
      eventDigest: '9'.repeat(64), ...hashes,
    })).rejects.toThrow();
  });
});
