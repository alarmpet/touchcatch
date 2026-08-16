import { describe, expect, it, vi } from 'vitest';
import { createAttemptHandlers } from './attempt-handlers.js';
import { AttemptVerifierAdapter } from '../learning/attempt-verifier.js';
import { PgRpcError } from '../database/pg-rpc.js';
import type { MobileAttemptPolicyState } from '../policy/mobile-runtime-policy.js';

const userId = '10000000-0000-4000-8000-000000000001';
const subjectKey = '20000000-0000-4000-8000-000000000001';
const seasonId = '30000000-0000-4000-8000-000000000001';
const contentRevisionId = '40000000-0000-4000-8000-000000000001';
const attemptId = '50000000-0000-4000-8000-000000000001';
const mutationKey = '70000000-0000-4000-8000-000000000001';
const contentHash = 'a'.repeat(64);

const enabled = {
  enabled: true as const,
  rulesetHash: 'd'.repeat(64),
  hintPolicyHash: 'e'.repeat(64),
  competitionPolicyHash: 'c'.repeat(64),
  catalogRevision: 'c1',
  catalogHash: 'b'.repeat(64),
};
const rewards = { enabled: true as const, economyVersion: 'e1', economyHash: 'f'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64), competitionPolicyHash: 'c'.repeat(64) };

const circle = (cx: number, cy: number) => ({ cx, cy, r: 0.05 });
const board = {
  attemptId, status: 'OPEN' as const, category: 'ENGLISH' as const, assetsReady: true,
  canonicalAnswer: 'cat',
  objectives: [
    { objectiveId: 'difference_1', hitboxes: { imageA: circle(0.2, 0.2), imageB: circle(0.2, 0.2) } },
    { objectiveId: 'difference_2', hitboxes: { imageA: circle(0.8, 0.8), imageB: circle(0.8, 0.8) } },
  ],
  claimedObjectiveIds: [] as string[],
  wrongTaps: 0,
};

const startedAt = '2026-08-14T00:00:00.000+00:00';
const assetsReadyAt = '2026-08-14T00:00:02.000+00:00';

function fixture(input: Readonly<{ policy?: MobileAttemptPolicyState; nowMs?: number }> = {}) {
  const resolver = { ensureAndResolve: vi.fn().mockResolvedValue(subjectKey) };
  const repository = {
    start: vi.fn().mockResolvedValue({ attemptId, status: 'OPEN', startedAt, expiresAt: '2026-08-14T00:15:00.000+00:00', contentRevisionId }),
    attestAssetsReady: vi.fn().mockResolvedValue({ attemptId, status: 'OPEN', assetsReadyAt }),
    commit: vi.fn().mockResolvedValue({ attemptId, status: 'COMPLETED_VERIFIED', completionMs: 30_000, acceptedAt: '2026-08-14T00:00:32.000+00:00', bestChanged: true }),
    readChallenges: vi.fn().mockResolvedValue({ seasonId, startsAt: '2026-08-10T15:00:00.000+00:00', endsAt: '2026-08-17T15:00:00.000+00:00', attemptTtlSeconds: 900, challenges: [] }),
    readBoard: vi.fn().mockResolvedValue(board),
    recordTap: vi.fn().mockResolvedValue({ attemptId, status: 'OPEN', outcome: 'HIT', objectiveId: 'difference_1', foundCount: 1, differenceCount: 2, wrongTaps: 0 }),
  };
  const handlers = createAttemptHandlers({
    verifier: { verify: async () => ({ authenticatedUserId: userId }) },
    subjectResolver: resolver,
    getPolicy: () => ({ rewards, ranking: rewards, attempts: input.policy ?? enabled }),
    repository,
    attemptVerifier: new AttemptVerifierAdapter(),
    now: () => input.nowMs ?? Date.parse('2026-08-14T00:00:32.000Z'),
  });
  return { resolver, repository, handlers };
}

function post(path: string, body: unknown, key: string | null = mutationKey): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (key !== null) headers['Idempotency-Key'] = key;
  return new Request(`https://api.test${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const completeBody = {
  contentHash,
  events: [{ type: 'TAP', timestampMs: 10 }, { type: 'TAP', timestampMs: 900 }],
  hintsUsed: 1,
  wrongTaps: 2,
  wrongAnswers: 0,
};

describe('learning attempt HTTP handlers', () => {
  it('opens a session with server-pinned hashes and never a client subject', async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attemptId, status: 'OPEN', startedAt });
    expect(repository.start.mock.calls[0]?.[0]).toMatchObject({
      subjectKey,
      seasonId,
      contentRevisionId,
      contentHash,
      idempotencyKey: mutationKey,
      rulesetHash: enabled.rulesetHash,
      hintPolicyHash: enabled.hintPolicyHash,
      competitionPolicyHash: enabled.competitionPolicyHash,
      petCatalogHash: enabled.catalogHash,
    });
    expect(repository.start.mock.calls[0]?.[0].requestHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects a start body that smuggles extra fields, a bad key, or a query string', async () => {
    const { handlers, repository } = fixture();
    expect((await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash, subjectKey }))).status).toBe(400);
    expect((await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash }, 'not-a-uuid'))).status).toBe(400);
    expect((await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash }, null))).status).toBe(400);
    expect((await handlers.startAttempt(post(`/v1/learning/attempts?subjectKey=${subjectKey}`, { seasonId, contentRevisionId, contentHash }))).status).toBe(400);
    expect(repository.start).not.toHaveBeenCalled();
  });

  it('scores from the database assets-ready stamp, not from anything the client sends', async () => {
    const { handlers, repository } = fixture({ nowMs: Date.parse('2026-08-14T00:00:32.000Z') });
    const response = await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'COMPLETED_VERIFIED', bestChanged: true });
    expect(repository.attestAssetsReady).toHaveBeenCalledOnce();
    // assetsReadyAt is 00:00:02 and the server clock is 00:00:32, so the ranked completion is
    // 30_000ms: 100_000 - 10_000 time - 6_000 wrong taps - 15_000 one hint.
    expect(repository.commit.mock.calls[0]?.[0]).toMatchObject({
      attemptId,
      idempotencyKey: mutationKey,
      displayScore: 69_000,
      hintsUsed: 1,
      wrongTaps: 2,
      wrongAnswers: 0,
    });
    expect(repository.commit.mock.calls[0]?.[0].eventDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('quarantines a client that skipped the assets-ready call', async () => {
    const { handlers, repository } = fixture();
    repository.attestAssetsReady.mockResolvedValueOnce({ attemptId, status: 'OPEN', assetsReadyAt: '2026-08-14T00:00:32.000+00:00' });
    repository.commit.mockResolvedValueOnce({ attemptId, status: 'QUARANTINED', completionMs: 0, bestChanged: false });

    const response = await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId);
    expect(await response.json()).toMatchObject({ status: 'QUARANTINED' });
    expect(repository.commit.mock.calls[0]?.[0].displayScore).toBe(0);
  });

  it('returns the expired attestation without committing', async () => {
    const { handlers, repository } = fixture();
    repository.attestAssetsReady.mockResolvedValueOnce({ attemptId, status: 'EXPIRED' });

    const response = await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attemptId, status: 'EXPIRED' });
    expect(repository.commit).not.toHaveBeenCalled();
  });

  it('still reaches commit for a terminal attempt so the stored response can replay', async () => {
    const { handlers, repository } = fixture();
    repository.attestAssetsReady.mockRejectedValueOnce(new PgRpcError('ATTEMPT_TERMINAL'));
    repository.commit.mockResolvedValueOnce({ attemptId, status: 'COMPLETED_VERIFIED', completionMs: 30_000, acceptedAt: '2026-08-14T00:00:32.000+00:00', bestChanged: false });

    const response = await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId);
    expect(response.status).toBe(200);
    expect(repository.commit).toHaveBeenCalledOnce();
  });

  it('sends one stable request hash so a retried submission replays instead of conflicting', async () => {
    const { handlers, repository } = fixture();
    await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId);
    await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId);
    expect(repository.commit.mock.calls[0]?.[0].requestHash).toBe(repository.commit.mock.calls[1]?.[0].requestHash);
  });

  it('rejects an out-of-order event log and a malformed attempt id', async () => {
    const { handlers, repository } = fixture();
    const outOfOrder = { ...completeBody, events: [{ type: 'TAP', timestampMs: 900 }, { type: 'TAP', timestampMs: 10 }] };
    expect((await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, outOfOrder), attemptId)).status).toBe(400);
    expect((await handlers.completeAttempt(post(`/v1/learning/attempts/x/complete`, completeBody), 'x')).status).toBe(400);
    expect(repository.commit).not.toHaveBeenCalled();
  });

  it('closes every route when the attempt policy is not approved', async () => {
    const { handlers, repository, resolver } = fixture({ policy: { enabled: false, code: 'HINT_POLICY_NOT_APPROVED' } });
    for (const response of [
      await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash })),
      await handlers.attestAttemptAssets(post(`/v1/learning/attempts/${attemptId}/assets-ready`, { contentHash }), attemptId),
      await handlers.completeAttempt(post(`/v1/learning/attempts/${attemptId}/complete`, completeBody), attemptId),
    ]) {
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ code: 'HINT_POLICY_NOT_APPROVED' });
    }
    expect(resolver.ensureAndResolve).not.toHaveBeenCalled();
    expect(repository.start).not.toHaveBeenCalled();
  });

  it('maps database codes to stable public statuses without leaking causes', async () => {
    const { handlers, repository } = fixture();
    const cases = [
      ['SEASON_NOT_FOUND', 404],
      ['CHALLENGE_PIN_MISMATCH', 404],
      ['SELECTED_PET_REQUIRED', 409],
      ['POLICY_MISMATCH', 409],
      ['IDEMPOTENCY_CONFLICT', 409],
      ['INVALID_ATTEMPT_START', 400],
    ] as const;
    for (const [code, status] of cases) {
      repository.start.mockRejectedValueOnce(new PgRpcError(code));
      const response = await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash }));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ code });
    }

    repository.start.mockRejectedValueOnce(new Error('password=secret constraint_private'));
    const leaky = await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash }));
    expect(leaky.status).toBe(503);
    expect(await leaky.json()).toEqual({ code: 'DATABASE_UNAVAILABLE' });
  });

  it('attests assets ready without letting the client name the attempt owner', async () => {
    const { handlers, repository, resolver } = fixture();
    const response = await handlers.attestAttemptAssets(post(`/v1/learning/attempts/${attemptId}/assets-ready`, { contentHash }), attemptId);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ attemptId, assetsReadyAt });
    expect(resolver.ensureAndResolve).toHaveBeenCalledWith(userId);
    expect(repository.attestAssetsReady).toHaveBeenCalledWith({
      subjectKey,
      attemptId,
      contentHash,
      rulesetHash: enabled.rulesetHash,
      hintPolicyHash: enabled.hintPolicyHash,
      competitionPolicyHash: enabled.competitionPolicyHash,
    });
  });

  it('reads the pinned board for one season and rejects any other query shape', async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.getWeeklyChallenges(new Request(`https://api.test/v1/learning/challenges?seasonId=${seasonId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ seasonId, challenges: [] });
    expect(repository.readChallenges).toHaveBeenCalledWith({ subjectKey, seasonId });

    for (const query of ['', '?seasonId=nope', `?seasonId=${seasonId}&subjectKey=${subjectKey}`]) {
      const rejected = await handlers.getWeeklyChallenges(new Request(`https://api.test/v1/learning/challenges${query}`));
      expect(rejected.status).toBe(400);
    }
    expect(repository.readChallenges).toHaveBeenCalledOnce();
  });

  it('resolves a tap server-side and returns one character, never the answer', async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 0.2, y: 0.2 }), attemptId);

    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload).toMatchObject({
      outcome: 'HIT',
      objectiveId: 'difference_1',
      openedUnit: { index: 0, text: 'c' },
      foundCount: 1,
    });
    // The board reaches this process but must not reach the wire.
    expect(JSON.stringify(payload)).not.toContain('cat');
    expect(JSON.stringify(payload)).not.toContain('difference_2');
    expect(repository.recordTap.mock.calls[0]?.[0]).toMatchObject({
      subjectKey, attemptId, claimedObjectiveId: 'difference_1', idempotencyKey: mutationKey,
    });
  });

  it('charges a miss nothing but a wrong tap and opens no unit', async () => {
    const { handlers, repository } = fixture();
    repository.recordTap.mockResolvedValueOnce({ attemptId, status: 'OPEN', outcome: 'MISS', objectiveId: null, foundCount: 0, differenceCount: 2, wrongTaps: 1 });

    const response = await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 0.5, y: 0.5 }), attemptId);
    expect(await response.json()).toMatchObject({ outcome: 'MISS', objectiveId: null, displayCircles: null, openedUnit: null, wrongTaps: 1 });
    expect(repository.recordTap.mock.calls[0]?.[0].claimedObjectiveId).toBeNull();
  });

  it('re-touching a found difference is a duplicate, not a wrong tap, and opens nothing', async () => {
    const { handlers, repository } = fixture();
    repository.readBoard.mockResolvedValueOnce({ ...board, claimedObjectiveIds: ['difference_1'] });
    repository.recordTap.mockResolvedValueOnce({ attemptId, status: 'OPEN', outcome: 'DUPLICATE', objectiveId: 'difference_1', foundCount: 1, differenceCount: 2, wrongTaps: 0 });

    const response = await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 0.2, y: 0.2 }), attemptId);
    expect(await response.json()).toMatchObject({ outcome: 'DUPLICATE', openedUnit: null, wrongTaps: 0 });
    // A duplicate must not be recorded as a fresh claim.
    expect(repository.recordTap.mock.calls[0]?.[0].claimedObjectiveId).toBeNull();
  });

  it('refuses a tap before the assets-ready stamp, so the board cannot be played off the clock', async () => {
    const { handlers, repository } = fixture();
    repository.readBoard.mockResolvedValueOnce({ ...board, assetsReady: false });

    const response = await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 0.2, y: 0.2 }), attemptId);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'ASSETS_NOT_READY' });
    expect(repository.recordTap).not.toHaveBeenCalled();
  });

  it('rejects a tap outside the board and one without an idempotency key', async () => {
    const { handlers, repository } = fixture();
    expect((await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 1.5, y: 0.2 }), attemptId)).status).toBe(400);
    expect((await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'C', x: 0.2, y: 0.2 }), attemptId)).status).toBe(400);
    expect((await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 0.2, y: 0.2 }, null), attemptId)).status).toBe(400);
    expect(repository.readBoard).not.toHaveBeenCalled();
  });

  it('hands a terminal attempt straight back without recording a tap', async () => {
    const { handlers, repository } = fixture();
    repository.readBoard.mockResolvedValueOnce({ attemptId, status: 'EXPIRED' });

    const response = await handlers.tapAttempt(post(`/v1/learning/attempts/${attemptId}/tap`, { contentHash, side: 'A', x: 0.2, y: 0.2 }), attemptId);
    expect(await response.json()).toEqual({ attemptId, status: 'EXPIRED' });
    expect(repository.recordTap).not.toHaveBeenCalled();
  });

  it('answers an unauthenticated caller before touching the database', async () => {
    const repository = { start: vi.fn(), attestAssetsReady: vi.fn(), commit: vi.fn(), readChallenges: vi.fn(), readBoard: vi.fn(), recordTap: vi.fn() };
    const handlers = createAttemptHandlers({
      verifier: { verify: async () => { throw new Error('UNAUTHORIZED'); } },
      subjectResolver: { ensureAndResolve: vi.fn() },
      getPolicy: () => ({ rewards, ranking: rewards, attempts: enabled }),
      repository,
      attemptVerifier: new AttemptVerifierAdapter(),
    });
    const response = await handlers.startAttempt(post('/v1/learning/attempts', { seasonId, contentRevisionId, contentHash }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'UNAUTHORIZED' });
    expect(repository.start).not.toHaveBeenCalled();
  });
});
