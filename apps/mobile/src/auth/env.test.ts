import { describe, expect, it } from 'vitest';
import { parseMobileEnvironment } from './env.js';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
  EXPO_PUBLIC_API_ORIGIN: 'https://api.touchcatch.example',
  EXPO_PUBLIC_WEEKLY_SEASON_ID: '30000000-0000-4000-8000-000000000001',
};

describe('mobile public environment', () => {
  it('accepts only exact credential-free origins and a publishable key', () => {
    expect(parseMobileEnvironment(valid, { production: true })).toEqual({
      supabaseUrl: valid.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: valid.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiOrigin: valid.EXPO_PUBLIC_API_ORIGIN,
      weeklySeasonId: valid.EXPO_PUBLIC_WEEKLY_SEASON_ID,
    });
  });

  it('rejects missing, secret-looking, and production-loopback values', () => {
    expect(() => parseMobileEnvironment({}, { production: true })).toThrow('MOBILE_ENV_INVALID');
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }, { production: true })).toThrow('MOBILE_KEY_FORBIDDEN');
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'service_role.jwt.value' }, { production: true })).toThrow('MOBILE_KEY_FORBIDDEN');
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'http://127.0.0.1:8787' }, { production: true })).toThrow('MOBILE_API_LOOPBACK_FORBIDDEN');
    expect(parseMobileEnvironment({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'http://127.0.0.1:8787' }, { production: false }).apiOrigin).toBe('http://127.0.0.1:8787');
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_API_ORIGIN: 'http://api.touchcatch.example' }, { production: true })).toThrow('MOBILE_API_HTTPS_REQUIRED');
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_WEEKLY_SEASON_ID: 'week-1' }, { production: true })).toThrow('MOBILE_SEASON_ID_INVALID');
  });
});
