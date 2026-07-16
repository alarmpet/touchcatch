import { describe, expect, it } from 'vitest';
import { parseAdminServerEnv, parseMobileEnv, parseServerEnv, projectAdminPublicEnv } from './env.js';

const mobile = {
  EXPO_PUBLIC_API_ORIGIN: 'https://api.example.test',
  EXPO_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  EXPO_PUBLIC_POSTHOG_KEY: 'posthog',
  EXPO_PUBLIC_SENTRY_DSN: 'https://public@sentry.example.test/1',
};

const server = {
  PORT: '3000',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'secret',
  DATABASE_URL: 'postgresql://user:pass@db.example.test/db',
  REDIS_URL: 'redis://redis.example.test:6379',
  SENTRY_DSN: 'https://private@sentry.example.test/1',
};

const admin = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
  SUPABASE_SECRET_KEY: 'secret',
};

describe('application environment boundaries', () => {
  it('parses each exact allow-list', () => {
    expect(parseMobileEnv(mobile)).toEqual(mobile);
    expect(parseServerEnv(server)).toEqual({ ...server, PORT: 3000 });
    expect(parseAdminServerEnv(admin)).toEqual(admin);
  });

  it('rejects unknown keys and public secret keys', () => {
    expect(() => parseServerEnv({ ...server, EXTRA: 'value' })).toThrow(/unknown.*EXTRA/i);
    expect(() => parseMobileEnv({ ...mobile, SUPABASE_SECRET_KEY: 'leak' })).toThrow(/unknown|secret/i);
  });

  it('rejects empty required values', () => {
    expect(() => parseMobileEnv({ ...mobile, EXPO_PUBLIC_API_ORIGIN: '' })).toThrow(/EXPO_PUBLIC_API_ORIGIN.*empty/i);
  });

  it('rejects loopback service URLs in production', () => {
    expect(() => parseMobileEnv({ ...mobile, EXPO_PUBLIC_API_ORIGIN: 'http://localhost:3000' }, 'production')).toThrow(/loopback/i);
    expect(() => parseServerEnv({ ...server, REDIS_URL: 'redis://127.0.0.1:6379' }, 'production')).toThrow(/loopback/i);
  });

  it('projects only the admin public allow-list', () => {
    const projected = projectAdminPublicEnv(parseAdminServerEnv(admin));
    expect(projected).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: admin.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: admin.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(projected).not.toHaveProperty('SUPABASE_SECRET_KEY');
  });
});
