import { describe, expect, it } from 'vitest';
import { parseMobileRuntimeEnv } from '../../apps/mobile/src/config/runtime.js';

const valid = { EXPO_PUBLIC_API_ORIGIN: 'https://api.example.test', EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable', EXPO_PUBLIC_POSTHOG_KEY: 'posthog', EXPO_PUBLIC_SENTRY_DSN: 'https://public@sentry.example.test/1' };
describe('mobile runtime egress config', () => {
  it('rejects HTTP and loopback bearer destinations in production', () => {
    expect(() => parseMobileRuntimeEnv({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'http://api.example.test' }, 'production')).toThrow(/HTTPS/i);
    expect(() => parseMobileRuntimeEnv({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'https://127.0.0.1' }, 'production')).toThrow(/loopback/i);
  });
});
