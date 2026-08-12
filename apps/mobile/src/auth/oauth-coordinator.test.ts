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
    await expect(coordinator.completeOAuth('spotlearn://auth/callback?code=one-time-code')).resolves.toEqual({ state: 'READY' });
    expect(exchanged).toEqual(['one-time-code']);
  });

  it.each([
    'spotlearn://auth/callback#access_token=forbidden',
    'https://attacker.example/auth/callback?code=x',
    'spotlearn://auth/wrong?code=x',
    'spotlearn://user:password@auth/callback?code=x',
    'spotlearn://auth:123/callback?code=x',
    'SPOTLEARN://auth/callback?code=x',
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

  it('deduplicates an exact dual delivery and returns the terminal result without a second exchange', async () => {
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
    await expect(coordinator.completeOAuth(callback)).resolves.toEqual({ state: 'READY' });
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('rejects a competing callback while one transaction is exchanging', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const exchangeCodeForSession = vi.fn(async () => { await held; return { error: null }; });
    const storage = memoryStorage();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending', previousSessionId: null }));
    const coordinator = createOAuthCoordinator({
      auth: { exchangeCodeForSession, getSessionIdentity: async () => null },
      browser: {}, storage, ensureAccount: async () => undefined,
    });

    const legitimate = coordinator.completeOAuth('spotlearn://auth/callback?code=legitimate');
    await expect(coordinator.completeOAuth('spotlearn://auth/callback?code=competing')).rejects.toThrow('OAUTH_COMPLETION_IN_PROGRESS');
    release();
    await expect(legitimate).resolves.toEqual({ state: 'READY' });
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith('legitimate');
  });

  it('fails closed when OAuth starts from or changes to an existing session', async () => {
    const storage = memoryStorage();
    const signInWithOAuth = vi.fn(async () => ({ data: { url: 'https://local.supabase.test/authorize' }, error: null }));
    const existing = createOAuthCoordinator({
      auth: { getSessionIdentity: async () => 'existing-user', signInWithOAuth }, browser: {}, storage,
      ensureAccount: async () => undefined,
    });
    await expect(existing.startOAuth('google')).rejects.toThrow('OAUTH_SESSION_EXISTS');
    expect(signInWithOAuth).not.toHaveBeenCalled();

    let identity: string | null = null;
    const changed = createOAuthCoordinator({
      auth: {
        getSessionIdentity: async () => identity,
        signInWithOAuth,
        exchangeCodeForSession: async () => ({ error: null }),
      },
      browser: { openAuthSessionAsync: async () => {
        identity = 'session-appeared';
        return { type: 'success', url: 'spotlearn://auth/callback?code=x' };
      } },
      storage, ensureAccount: async () => undefined,
    });
    await expect(changed.startOAuth('kakao')).rejects.toThrow('OAUTH_SESSION_CHANGED');
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
