import { describe, expect, it } from 'vitest';
import { createHttpRouter } from './router.js';

describe('authenticated HTTP ingress', () => {
  it('verifies bearer, bootstraps, and serves authoritative /v1/me', async () => {
    const calls: string[] = [];
    const router = createHttpRouter({
      verifyAccessToken: async (token) => { calls.push(`verify:${token}`); return { authSub: 'auth-sub', isAnonymous: false }; },
      ensureAccount: async (sub) => { calls.push(`ensure:${sub}`); return true; },
      readMe: async (sub) => { calls.push(`read:${sub}`); return { profile: { displayName: 'Player-12345678' }, points: 9 }; },
    });
    const response = await router(new Request('https://api.test/v1/me', { headers: { authorization: 'Bearer valid-token' } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ profile: { displayName: 'Player-12345678' }, points: 9 });
    expect(calls).toEqual(['verify:valid-token', 'ensure:auth-sub', 'read:auth-sub']);
  });

  it('fails closed before account access for missing or anonymous bearer', async () => {
    let accountCalls = 0;
    const router = createHttpRouter({ verifyAccessToken: async () => ({ authSub: 'auth-sub', isAnonymous: true }), ensureAccount: async () => { accountCalls++; return true; }, readMe: async () => { throw new Error('unreachable'); } });
    expect((await router(new Request('https://api.test/v1/me'))).status).toBe(401);
    expect((await router(new Request('https://api.test/v1/me', { headers: { authorization: 'Bearer token-value' } }))).status).toBe(403);
    expect(accountCalls).toBe(0);
  });

  it('routes a verified progress batch with its idempotency key', async () => {
    const mergeProgress = async (_identity: unknown, key: string, body: unknown) => ({ acceptedEventIds: [key], rejected: [], body });
    const router = createHttpRouter({ verifyAccessToken: async () => ({ authSub: 'auth-sub', isAnonymous: false }), ensureAccount: async () => true, readMe: async () => ({ profile: { displayName: 'Player' }, points: 0 }), mergeProgress });
    const idempotencyKey = '00000000-0000-4000-8000-000000000020';
    const body = { schemaVersion: '1', events: [] };
    const response = await router(new Request('https://api.test/v1/learning/progress/merge', { method: 'POST', headers: { authorization: 'Bearer valid-token', 'idempotency-key': idempotencyKey, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ acceptedEventIds: [idempotencyKey], body });
  });

  it('routes nickname updates and deletion requests through authenticated handlers', async () => {
    const updateProfile = async (_identity: unknown, key: string, body: unknown) => ({ key, body });
    const requestAccountDeletion = async (_identity: unknown, key: string) => ({ jobId: key, status: 'DELETING' });
    const router = createHttpRouter({ verifyAccessToken: async () => ({ authSub: 'auth-sub', isAnonymous: false }), ensureAccount: async () => true, readMe: async () => ({ profile: { displayName: 'Player' }, points: 0 }), updateProfile, requestAccountDeletion });
    const key = '00000000-0000-4000-8000-000000000020';
    const patch = await router(new Request('https://api.test/v1/me', { method: 'PATCH', headers: { authorization: 'Bearer valid-token', 'idempotency-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Touch Catch' }) }));
    expect(patch.status).toBe(200);
    await expect(patch.json()).resolves.toMatchObject({ key, body: { nickname: 'Touch Catch' } });
    const deletion = await router(new Request('https://api.test/v1/me', { method: 'DELETE', headers: { authorization: 'Bearer valid-token', 'idempotency-key': key } }));
    expect(deletion.status).toBe(202);
    await expect(deletion.json()).resolves.toEqual({ jobId: key, status: 'DELETING' });
  });

  it('maps authoritative account lifecycle errors to their public statuses', async () => {
    const base = { verifyAccessToken: async () => ({ authSub: 'auth-sub', isAnonymous: false }), readMe: async () => ({ profile: { displayName: 'Player' }, points: 0 }) };
    const deleting = createHttpRouter({ ...base, ensureAccount: async () => { throw new Error('ACCOUNT_DELETING'); } });
    const denied = await deleting(new Request('https://api.test/v1/me', { headers: { authorization: 'Bearer valid-token' } }));
    expect(denied.status).toBe(403); await expect(denied.json()).resolves.toEqual({ code: 'ACCOUNT_DELETING' });
    const limited = createHttpRouter({ ...base, ensureAccount: async () => true, updateProfile: async () => { throw new Error('RATE_LIMITED'); } });
    const response = await limited(new Request('https://api.test/v1/me', { method: 'PATCH', headers: { authorization: 'Bearer valid-token', 'idempotency-key': crypto.randomUUID(), 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'Player' }) }));
    expect(response.status).toBe(429); await expect(response.json()).resolves.toEqual({ code: 'RATE_LIMITED' });
    const readRace = createHttpRouter({ ...base, ensureAccount: async () => true, readMe: async () => { throw new Error('ACCOUNT_DELETING'); } });
    const raced = await readRace(new Request('https://api.test/v1/me', { headers: { authorization: 'Bearer valid-token' } }));
    expect(raced.status).toBe(403); await expect(raced.json()).resolves.toEqual({ code: 'ACCOUNT_DELETING' });
  });
});
