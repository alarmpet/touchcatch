import { describe, expect, it, vi } from 'vitest';
import { createRankingHandler } from './ranking-handler.js';

const enabled = { enabled: true as const, economyVersion: 'e', economyHash: 'a'.repeat(64), catalogRevision: 'c', catalogHash: 'b'.repeat(64), competitionPolicyHash: 'c'.repeat(64) };

describe('weekly ranking HTTP handler', () => {
  it('returns one strict authenticated board', async () => {
    const board = { read: vi.fn().mockResolvedValue({ seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH', snapshotRevision: 's1', rows: [], myRank: null }) };
    const handler = createRankingHandler({ verifier: { verify: async () => ({ authenticatedUserId: '10000000-0000-4000-8000-000000000001' }) }, subjectResolver: { ensureAndResolve: async () => '20000000-0000-4000-8000-000000000001' }, getPolicy: () => ({ rewards: enabled, ranking: enabled }), board });
    const response = await handler(new Request('https://api.test/v1/learning/leaderboard?seasonId=30000000-0000-4000-8000-000000000001&category=ENGLISH&limit=10'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ snapshotRevision: 's1', myRank: null });
    expect(board.read).toHaveBeenCalledWith({ subjectKey: '20000000-0000-4000-8000-000000000001', seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH', limit: 10 });
  });

  it('maps malformed queries, disabled policies, and storage failures without leaking causes', async () => {
    const resolver = { ensureAndResolve: vi.fn() };
    const board = { read: vi.fn() };
    const disabled = createRankingHandler({ verifier: { verify: async () => ({ authenticatedUserId: 'x' }) }, subjectResolver: resolver, getPolicy: () => ({ rewards: enabled, ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' } }), board });
    expect((await disabled(new Request('https://api.test/v1/learning/leaderboard?seasonId=bad&category=ENGLISH&limit=10'))).status).toBe(400);
    const policyResponse = await disabled(new Request('https://api.test/v1/learning/leaderboard?seasonId=30000000-0000-4000-8000-000000000001&category=ENGLISH&limit=10'));
    expect(policyResponse.status).toBe(409);
    expect(resolver.ensureAndResolve).not.toHaveBeenCalled();
    const failing = createRankingHandler({ verifier: { verify: async () => ({ authenticatedUserId: 'x' }) }, subjectResolver: { ensureAndResolve: async () => 'y' }, getPolicy: () => ({ rewards: enabled, ranking: enabled }), board: { read: async () => { throw new Error('password=secret constraint_private'); } } });
    const failure = await failing(new Request('https://api.test/v1/learning/leaderboard?seasonId=30000000-0000-4000-8000-000000000001&category=PROVERB&limit=1'));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({ code: 'LEADERBOARD_UNAVAILABLE' });
  });
});
