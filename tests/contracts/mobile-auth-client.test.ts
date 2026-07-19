import { describe, expect, it } from 'vitest';
import { createAuthClientFactory, parseMobileAuthEnv } from '../../apps/mobile/src/auth/client.js';

describe('mobile Supabase client', () => {
  it('fails closed on missing or malformed auth environment', () => {
    expect(() => parseMobileAuthEnv({})).toThrow(/SUPABASE_URL/);
    expect(() => parseMobileAuthEnv({ EXPO_PUBLIC_SUPABASE_URL: 'not-url', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'key' })).toThrow(/URL/);
  });

  it('creates one PKCE client with persistent native storage and process lock', () => {
    const calls: unknown[] = [];
    const storage = { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined };
    const lock = async <R>(_name: string, _timeout: number, fn: () => Promise<R>) => fn();
    const factory = createAuthClientFactory({
      env: { EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable' },
      storage,
      lock,
      createClient: (...args: unknown[]) => { calls.push(args); return { id: 'client' }; },
    });
    expect(factory.getClient()).toBe(factory.getClient());
    expect(calls).toEqual([['https://project.supabase.co', 'publishable', { auth: { storage, flowType: 'pkce', autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock } }]]);
  });
});
