import { describe, expect, it, vi } from 'vitest';
import { createMobileApiHandlers, createPetHandlers } from './pet-handlers.js';
import type { MobileRuntimePolicyState } from '../policy/mobile-runtime-policy.js';
import { PgRpcError } from '../database/pg-rpc.js';

const pins = { enabled: true as const, economyVersion: 'e1', economyHash: 'a'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64), competitionPolicyHash: 'c'.repeat(64) };
const attemptPins = { enabled: true as const, rulesetHash: 'd'.repeat(64), hintPolicyHash: 'e'.repeat(64), competitionPolicyHash: 'c'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64) };
const attemptHandlers = { getWeeklyChallenges: vi.fn(), startAttempt: vi.fn(), attestAttemptAssets: vi.fn(), tapAttempt: vi.fn(), completeAttempt: vi.fn() };
const userId = '10000000-0000-4000-8000-000000000001';
const subjectKey = '20000000-0000-4000-8000-000000000001';

function fixture(policy: MobileRuntimePolicyState = pins) {
  const resolver = { ensureAndResolve: vi.fn().mockResolvedValue(subjectKey) };
  const repository = {
    readCollection: vi.fn().mockResolvedValue({ claimedToday: false, ownedCount: 0, totalCount: 0, rarityProgress: { COMMON: { ownedCount: 0, totalCount: 0 }, RARE: { ownedCount: 0, totalCount: 0 }, LEGENDARY: { ownedCount: 0, totalCount: 0 } }, pets: [] }),
    claimEffectOnce: vi.fn().mockResolvedValue({ claimDate: '2026-08-11', seriesId: 'DAILY_FREE_DRAW_V1', pet: { userPetId: '30000000-0000-4000-8000-000000000001', petId: '40000000-0000-4000-8000-000000000001', rarity: 'COMMON', copies: 1 }, economyVersion: 'e1', economyHash: 'a'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64) }),
    promoteEffectOnce: vi.fn().mockResolvedValue({ consumed: { petId: '40000000-0000-4000-8000-000000000001', copies: 10, rows: [{ userPetId: '30000000-0000-4000-8000-000000000001', copies: 10 }] }, remainingCopies: 1, output: { userPetId: '50000000-0000-4000-8000-000000000001', petId: '60000000-0000-4000-8000-000000000001', rarity: 'RARE', copies: 1 }, economyVersion: 'e1', economyHash: 'a'.repeat(64), catalogRevision: 'c1', catalogHash: 'b'.repeat(64) }),
  };
  return { resolver, repository, handlers: createPetHandlers({ verifier: { verify: async () => ({ authenticatedUserId: userId }) }, subjectResolver: resolver, getPolicy: () => ({ rewards: policy, ranking: pins, attempts: attemptPins }), repository, now: () => new Date('2026-08-11T00:00:00Z') }) };
}

describe('pet HTTP handlers', () => {
  it('returns the authenticated collection and never accepts a client subject', async () => {
    const { handlers, repository } = fixture();
    const response = await handlers.getPetCollection(new Request('https://api.test/v1/pets/collection'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ownedCount: 0, pets: [] });
    expect(repository.readCollection).toHaveBeenCalledWith({ subjectKey, catalogRevision: 'c1', catalogHash: 'b'.repeat(64) });
  });

  it('checks disabled policy before subject bootstrap or any repository effect', async () => {
    const disabled = { enabled: false as const, code: 'REWARD_POLICY_NOT_APPROVED' as const };
    const { handlers, resolver, repository } = fixture(disabled);
    const response = await handlers.claimDailyDraw(new Request('https://api.test/v1/pets/daily-draw', { method: 'POST', headers: { 'Idempotency-Key': '70000000-0000-4000-8000-000000000001' } }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'REWARD_POLICY_NOT_APPROVED' });
    expect(resolver.ensureAndResolve).not.toHaveBeenCalled();
    expect(repository.claimEffectOnce).not.toHaveBeenCalled();
  });

  it('rejects extra promotion fields and hashes the exact accepted request', async () => {
    const { handlers, repository } = fixture();
    const bad = await handlers.promoteDuplicates(new Request('https://api.test/v1/pets/duplicate-promotion', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': '70000000-0000-4000-8000-000000000001' }, body: JSON.stringify({ subjectKey, materials: [] }) }));
    expect(bad.status).toBe(400);
    const good = await handlers.promoteDuplicates(new Request('https://api.test/v1/pets/duplicate-promotion', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': '70000000-0000-4000-8000-000000000001' }, body: JSON.stringify({ materials: [{ petId: '40000000-0000-4000-8000-000000000001', count: 10 }] }) }));
    expect(good.status).toBe(200);
    expect(repository.promoteEffectOnce.mock.calls[0]?.[0]).toMatchObject({ subjectKey, idempotencyKey: '70000000-0000-4000-8000-000000000001', sourcePetId: '40000000-0000-4000-8000-000000000001', consumedCopies: 10 });
    expect(repository.promoteEffectOnce.mock.calls[0]?.[0].requestHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('maps authentication and domain errors to stable public statuses', async () => {
    const unauthorized = createPetHandlers({ verifier: { verify: async () => { throw new Error('UNAUTHORIZED'); } }, subjectResolver: { ensureAndResolve: vi.fn() }, getPolicy: () => ({ rewards: pins, ranking: pins, attempts: attemptPins }), repository: fixture().repository });
    const authResponse = await unauthorized.getPetCollection(new Request('https://api.test/v1/pets/collection'));
    expect(authResponse.status).toBe(401);
    expect(await authResponse.json()).toEqual({ code: 'UNAUTHORIZED' });

    const f = fixture();
    f.repository.promoteEffectOnce.mockRejectedValueOnce(new PgRpcError('NOT_OWNED'));
    const notOwned = await f.handlers.promoteDuplicates(new Request('https://api.test/v1/pets/duplicate-promotion', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': '70000000-0000-4000-8000-000000000001' }, body: JSON.stringify({ materials: [{ petId: '40000000-0000-4000-8000-000000000001', count: 10 }] }) }));
    expect(notOwned.status).toBe(404);
    expect(await notOwned.json()).toEqual({ code: 'NOT_OWNED' });
  });

  it('rejects client-controlled fields on read and bodyless mutation routes and composes all five handlers', async () => {
    const f = fixture();
    expect((await f.handlers.getPetCollection(new Request(`https://api.test/v1/pets/collection?subjectKey=${subjectKey}`))).status).toBe(400);
    expect((await f.handlers.claimDailyDraw(new Request('https://api.test/v1/pets/daily-draw', { method: 'POST', headers: { 'Idempotency-Key': '70000000-0000-4000-8000-000000000001' }, body: JSON.stringify({ userId }) }))).status).toBe(400);
    expect(f.repository.claimEffectOnce).not.toHaveBeenCalled();
    const me = vi.fn();
    const ranking = vi.fn();
    const combined = createMobileApiHandlers(f.handlers, me, ranking, attemptHandlers, {
      deleteMe: vi.fn(async () => new Response(null, { status: 202 })),
      readDeletionStatus: vi.fn(async () => new Response(null, { status: 200 })),
    });
    await combined.getMe(new Request('https://api.test/v1/me'));
    await combined.getWeeklyLeaderboard(new Request('https://api.test/v1/learning/leaderboard'));
    expect(me).toHaveBeenCalledOnce();
    expect(ranking).toHaveBeenCalledOnce();
    expect(Object.keys(combined).sort()).toEqual(['attestAttemptAssets', 'claimDailyDraw', 'completeAttempt', 'deleteMe', 'getMe', 'getPetCollection', 'getWeeklyChallenges', 'getWeeklyLeaderboard', 'promoteDuplicates', 'readDeletionStatus', 'startAttempt', 'tapAttempt']);
  });
});
