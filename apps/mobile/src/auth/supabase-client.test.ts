import { describe, expect, it, vi } from 'vitest';
import { createMobileSupabaseRuntime } from './supabase-client.js';

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
// The native module, not `./webcrypto-install.js`: mocking the install module itself would let
// the import be deleted without a test noticing, and the import order is the whole point.
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' },
  digest: vi.fn(),
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() }, Platform: { OS: 'android' } }));

describe('mobile Supabase runtime', () => {
  it('has installed crypto.subtle by the time supabase-js is reachable, so PKCE is S256', () => {
    // supabase-js reads `crypto.subtle` when it derives the code challenge and silently drops to
    // `plain` if it is missing. Importing this module must be enough to prevent that; if the
    // install import is removed or ordered after supabase-js, this fails.
    expect(typeof (globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle).toBe('object');
  });

  it('uses the PKCE flow, persistent storage, process lock, and native foreground refresh without exposing the client', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const remove = vi.fn();
    let appStateCallback: ((state: string) => void) | undefined;
    const auth = {
      getSession: vi.fn(), refreshSession: vi.fn(), onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(), signOut: vi.fn(),
      startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(),
    };
    const createClient = vi.fn().mockReturnValue({ auth });
    const runtime = createMobileSupabaseRuntime({
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
    }, {
      createClient: createClient as never,
      storage: storage as never,
      lock: vi.fn() as never,
      platform: 'android',
      addAppStateListener: (callback) => { appStateCallback = callback; return { remove }; },
    });
    expect(createClient).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^sb_publishable_/u), {
      auth: expect.objectContaining({ storage, flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }),
    });
    expect(runtime).not.toHaveProperty('client');
    appStateCallback?.('active');
    appStateCallback?.('background');
    expect(auth.startAutoRefresh).toHaveBeenCalledOnce();
    expect(auth.stopAutoRefresh).toHaveBeenCalledOnce();
    runtime.dispose();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('projects only the narrow OAuth authorization, code exchange, and session identity operations', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { session: {} }, error: null });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'access', user: { id: 'user-1', email: 'learner@example.test' } } }, error: null });
    const runtime = createMobileSupabaseRuntime({
      supabaseUrl: 'https://project.supabase.co',
      supabasePublishableKey: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
    }, {
      createClient: vi.fn().mockReturnValue({ auth: {
        getSession, refreshSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(),
        signInWithOAuth, exchangeCodeForSession, startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(),
      } }) as never,
      storage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() } as never,
      platform: 'web',
    });

    await expect(runtime.auth.signInWithOAuth?.({ provider: 'google', options: { redirectTo: 'touchcatch://auth/callback', skipBrowserRedirect: true } })).resolves.toEqual({ data: { url: 'https://project.supabase.co/auth/v1/authorize' }, error: null });
    await expect(runtime.auth.exchangeCodeForSession?.('one-time-code')).resolves.toEqual({ error: null });
    await expect(runtime.auth.getSessionIdentity?.()).resolves.toBe('user-1');
    expect(runtime).not.toHaveProperty('client');
  });
});
