import { describe, expect, it, vi } from 'vitest';
import { createOAuthCoordinator } from '../../apps/mobile/src/auth/oauth.js';

function memoryStore() {
  const values = new Map<string, string>();
  return { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } };
}

class ReceiverSensitiveOAuthAuth {
  readonly calls: string[] = [];

  private requireReceiver() {
    if (!(this instanceof ReceiverSensitiveOAuthAuth)) throw new Error('Auth method receiver was lost');
  }

  async signInWithOAuth() {
    this.requireReceiver();
    this.calls.push('start');
    return { data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null };
  }

  async exchangeCodeForSession() {
    this.requireReceiver();
    this.calls.push('exchange');
    return { error: null };
  }
}

describe('mobile OAuth PKCE coordinator', () => {
  it('opens only a generated PKCE URL and exchanges a code from the exact callback', async () => {
    const exchange = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const coordinator = createOAuthCoordinator({
      auth: { signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null })), exchangeCodeForSession: exchange },
      browser: { openAuthSessionAsync: vi.fn(async () => ({ type: 'success', url: 'spotlearn://auth/callback?code=abc' })) },
      storage: memoryStore(), ensureAccount: vi.fn(async () => undefined),
    });
    await expect(coordinator.startOAuth('google')).resolves.toEqual({ state: 'READY' });
    expect(exchange).toHaveBeenCalledWith('abc');
  });

  it('preserves the Auth receiver when starting OAuth', async () => {
    const auth = new ReceiverSensitiveOAuthAuth();
    const coordinator = createOAuthCoordinator({
      auth,
      browser: { openAuthSessionAsync: vi.fn(async () => ({ type: 'success', url: 'spotlearn://auth/callback?code=oauth-code' })) },
      storage: memoryStore(), ensureAccount: vi.fn(async () => undefined),
    });

    await expect(coordinator.startOAuth('google')).resolves.toEqual({ state: 'READY' });
    expect(auth.calls).toEqual(['start', 'exchange']);
  });

  it('preserves the Auth receiver when exchanging an OAuth callback', async () => {
    const auth = new ReceiverSensitiveOAuthAuth();
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const coordinator = createOAuthCoordinator({ auth, browser: {}, storage, ensureAccount: vi.fn(async () => undefined) });

    await expect(coordinator.completeOAuth('spotlearn://auth/callback?code=oauth-code')).resolves.toEqual({ state: 'READY' });
    expect(auth.calls).toEqual(['exchange']);
  });

  it('rejects fragments, foreign callbacks, provider errors, and callback replay', async () => {
    const exchange = vi.fn(async () => ({ data: { session: {} }, error: null }));
    const storage = memoryStore(); await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const coordinator = createOAuthCoordinator({ auth: { exchangeCodeForSession: exchange }, browser: {}, storage, ensureAccount: vi.fn(async () => undefined) });
    await expect(coordinator.completeOAuth('spotlearn://auth/callback#access_token=leak')).rejects.toThrow(/fragment/i);
    await expect(coordinator.completeOAuth('https://evil.example/auth/callback?code=x')).rejects.toThrow(/callback/i);
    await expect(coordinator.completeOAuth('spotlearn://auth/callback?error=access_denied')).rejects.toThrow(/provider/i);
    await expect(coordinator.completeOAuth('spotlearn://auth/callback?code=once')).resolves.toEqual({ state: 'READY' });
    await expect(coordinator.completeOAuth('spotlearn://auth/callback?code=once')).rejects.toThrow(/pending/i);
  });

  it('deduplicates browser, cold-start, and live-link delivery of one callback', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const exchange = vi.fn(async () => { await held; return { data: { session: {} }, error: null }; });
    const storage = memoryStore(); await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const coordinator = createOAuthCoordinator({ auth: { exchangeCodeForSession: exchange }, browser: {}, storage, ensureAccount: vi.fn(async () => undefined) });
    const url = 'spotlearn://auth/callback?code=concurrent';
    const results = [coordinator.completeOAuth(url), coordinator.completeOAuth(url), coordinator.completeOAuth(url)];
    release();
    await expect(Promise.all(results)).resolves.toEqual([{ state: 'READY' }, { state: 'READY' }, { state: 'READY' }]);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it('resumes bootstrap after a crash once a session is established', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'exchanging' }));
    const ensureAccount = vi.fn(async () => undefined);
    const coordinator = createOAuthCoordinator({ auth: {}, browser: {}, storage, ensureAccount });
    await expect(coordinator.resume('new-user')).resolves.toEqual({ state: 'READY' });
    expect(ensureAccount).toHaveBeenCalledTimes(1);
    expect(await storage.getItem('touchcatch.auth.pkce.pending')).toBeNull();
  });

  it('does not clear a pre-exchange pending flow during session restore', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'authorization-pending' }));
    const ensureAccount = vi.fn();
    const coordinator = createOAuthCoordinator({ auth: {}, browser: {}, storage, ensureAccount });
    await expect(coordinator.resume('old-user')).resolves.toBeNull();
    expect(ensureAccount).not.toHaveBeenCalled();
    expect(await storage.getItem('touchcatch.auth.pkce.pending')).not.toBeNull();
  });

  it('does not mistake the pre-flow session for a completed exchange', async () => {
    const storage = memoryStore();
    await storage.setItem('touchcatch.auth.pkce.pending', JSON.stringify({ kind: 'oauth', stage: 'exchanging', previousSessionId: 'old-user' }));
    const ensureAccount = vi.fn();
    const coordinator = createOAuthCoordinator({ auth: {}, browser: {}, storage, ensureAccount });
    await expect(coordinator.resume('old-user')).resolves.toBeNull();
    expect(ensureAccount).not.toHaveBeenCalled();
  });

  it('clears pending state when OAuth setup throws', async () => {
    const storage = memoryStore();
    const coordinator = createOAuthCoordinator({ auth: { signInWithOAuth: vi.fn(async () => { throw new Error('network'); }) }, browser: { openAuthSessionAsync: vi.fn() }, storage, ensureAccount: vi.fn() });
    await expect(coordinator.startOAuth('google')).rejects.toThrow('network');
    expect(await storage.getItem('touchcatch.auth.pkce.pending')).toBeNull();
  });
});
