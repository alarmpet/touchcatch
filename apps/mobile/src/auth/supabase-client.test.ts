import { describe, expect, it, vi } from 'vitest';
import { createMobileSupabaseRuntime } from './supabase-client.js';

vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn() }, Platform: { OS: 'android' } }));

describe('mobile Supabase runtime', () => {
  it('uses persistent storage, process lock, and native foreground refresh without exposing the client', () => {
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
      auth: expect.objectContaining({ storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }),
    });
    expect(runtime).not.toHaveProperty('client');
    appStateCallback?.('active');
    appStateCallback?.('background');
    expect(auth.startAutoRefresh).toHaveBeenCalledOnce();
    expect(auth.stopAutoRefresh).toHaveBeenCalledOnce();
    runtime.dispose();
    expect(remove).toHaveBeenCalledOnce();
  });
});
