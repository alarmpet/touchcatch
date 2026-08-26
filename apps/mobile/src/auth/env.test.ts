import { describe, expect, it } from 'vitest';
import { parseMobileEnvironment } from './env.js';

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
  EXPO_PUBLIC_API_ORIGIN: 'https://api.touchcatch.example',
  EXPO_PUBLIC_WEEKLY_SEASON_ID: '30000000-0000-4000-8000-000000000001',
  EXPO_PUBLIC_PORTAL_ORIGIN: 'https://touchcatch.example',
};

describe('mobile public environment', () => {
  it('accepts only exact credential-free origins and a publishable key', () => {
    expect(parseMobileEnvironment(valid, { production: true })).toEqual({
      supabaseUrl: valid.EXPO_PUBLIC_SUPABASE_URL,
      supabasePublishableKey: valid.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiOrigin: valid.EXPO_PUBLIC_API_ORIGIN,
      weeklySeasonId: valid.EXPO_PUBLIC_WEEKLY_SEASON_ID,
      portalOrigin: valid.EXPO_PUBLIC_PORTAL_ORIGIN,
    });
  });

  // Play will not accept a build whose privacy policy cannot be opened, and the profile footer
  // is the only route to it from inside the app. Optional in development so the loopback stack
  // still boots without a published portal.
  it('requires a published portal origin in production and allows its absence in development', () => {
    const { EXPO_PUBLIC_PORTAL_ORIGIN: _omitted, ...withoutPortal } = valid;
    expect(() => parseMobileEnvironment(withoutPortal, { production: true }))
      .toThrow('MOBILE_PORTAL_ORIGIN_REQUIRED');
    expect(parseMobileEnvironment(withoutPortal, { production: false }).portalOrigin).toBeNull();
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_PORTAL_ORIGIN: 'http://touchcatch.example' }, { production: true }))
      .toThrow('MOBILE_PORTAL_HTTPS_REQUIRED');
    expect(() => parseMobileEnvironment({ ...valid, EXPO_PUBLIC_PORTAL_ORIGIN: 'https://touchcatch.example/privacy/' }, { production: true }))
      .toThrow('MOBILE_PORTAL_ORIGIN_INVALID');
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
