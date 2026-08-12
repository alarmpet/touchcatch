import { describe, expect, it, vi } from 'vitest';
import { createOAuthCoordinator } from './oauth-coordinator.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
  };
}

describe('Google and Kakao PKCE coordinator', () => {
  it.each(['google', 'kakao'] as const)('exchanges only the code from the exact callback for %s', async (provider) => {
    const exchanged: string[] = [];
    const coordinator = createOAuthCoordinator({
      auth: {
        getSessionIdentity: async () => null,
        signInWithOAuth: async (input) => ({ data: { url: `https://local.supabase.test/authorize?provider=${input.provider}` }, error: null }),
        exchangeCodeForSession: async (code) => { exchanged.push(code); return { error: null }; },
      },
      browser: { openAuthSessionAsync: async () => ({ type: 'success', url: 'spotlearn://auth/callback?code=one-time-code' }) },
      storage: memoryStorage(),
      ensureAccount: async () => undefined,
    });

    await expect(coordinator.startOAuth(provider)).resolves.toEqual({ state: 'READY' });
    expect(exchanged).toEqual(['one-time-code']);
  });

  it.each([
    'spotlearn://auth/callback#access_token=forbidden',
    'https://attacker.example/auth/callback?code=x',
    'spotlearn://auth/wrong?code=x',
    'spotlearn://auth/callback?error=access_denied',
    'spotlearn://auth/callback?code=x&state=unexpected',
  ])('rejects malformed callback %s without exchanging it', async (url) => {
    const exchangeCodeForSession = vi.fn();
    const storage = memoryStorage();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const coordinator = createOAuthCoordinator({
      auth: { exchangeCodeForSession, getSessionIdentity: async () => null },
      browser: {}, storage, ensureAccount: async () => undefined,
    });

    await expect(coordinator.completeOAuth(url)).rejects.toThrow(/OAUTH_CALLBACK_/u);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent delivery and rejects replay after completion', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const exchangeCodeForSession = vi.fn(async () => { await held; return { error: null }; });
    const storage = memoryStorage();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const coordinator = createOAuthCoordinator({
      auth: { exchangeCodeForSession, getSessionIdentity: async () => null },
      browser: {}, storage, ensureAccount: async () => undefined,
    });
    const callback = 'spotlearn://auth/callback?code=once';
    const completions = [coordinator.completeOAuth(callback), coordinator.completeOAuth(callback)];
    release();
    await expect(Promise.all(completions)).resolves.toEqual([{ state: 'READY' }, { state: 'READY' }]);
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    await expect(coordinator.completeOAuth(callback)).rejects.toThrow('OAUTH_PENDING_MISSING');
  });

  it('clears pending authorization after browser cancellation', async () => {
    const storage = memoryStorage();
    const coordinator = createOAuthCoordinator({
      auth: {
        getSessionIdentity: async () => null,
        signInWithOAuth: async () => ({ data: { url: 'https://local.supabase.test/authorize' }, error: null }),
      },
      browser: { openAuthSessionAsync: async () => ({ type: 'cancel' }) },
      storage, ensureAccount: async () => undefined,
    });
    await expect(coordinator.startOAuth('google')).rejects.toThrow('OAUTH_CANCELLED');
    expect(await storage.getItem('touchcatch.auth.pkce.pending')).toBeNull();
  });

  it('preserves bootstrap-pending state when account setup fails', async () => {
    const storage = memoryStorage();
    const coordinator = createOAuthCoordinator({
      auth: {
        getSessionIdentity: async () => null,
        signInWithOAuth: async () => ({ data: { url: 'https://local.supabase.test/authorize' }, error: null }),
        exchangeCodeForSession: async () => ({ error: null }),
      },
      browser: { openAuthSessionAsync: async () => ({ type: 'success', url: 'spotlearn://auth/callback?code=x' }) },
      storage, ensureAccount: async () => { throw new Error('private server detail'); },
    });
    await expect(coordinator.startOAuth('kakao')).resolves.toEqual({ state: 'ACCOUNT_SETUP_FAILED' });
    expect(await storage.getItem('touchcatch.auth.pkce.pending')).toContain('bootstrap-pending');
  });
});
