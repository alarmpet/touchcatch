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
});
