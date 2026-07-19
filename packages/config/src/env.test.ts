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
  SUPABASE_PUBLISHABLE_KEY: 'publishable',
  DATABASE_URL: 'postgresql://user:pass@db.example.test/db',
  REDIS_URL: 'redis://redis.example.test:6379',
  SENTRY_DSN: 'https://private@sentry.example.test/1',
};

const admin = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable',
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
    expect(() => parseAdminServerEnv({ ...admin, REDIS_URL: 'redis://cache.example.test' })).toThrow(/unknown.*REDIS_URL/i);
  });

  it('rejects empty required values', () => {
    expect(() => parseMobileEnv({ ...mobile, EXPO_PUBLIC_API_ORIGIN: '' })).toThrow(/EXPO_PUBLIC_API_ORIGIN.*empty/i);
    expect(() => parseServerEnv({ ...server, DATABASE_URL: '' })).toThrow(/DATABASE_URL.*empty/i);
    expect(() => parseAdminServerEnv({ ...admin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.*empty/i);
  });

  it('rejects loopback service URLs in production', () => {
    expect(() => parseMobileEnv({ ...mobile, EXPO_PUBLIC_API_ORIGIN: 'http://localhost:3000' }, 'production')).toThrow(/loopback/i);
    expect(() => parseServerEnv({ ...server, REDIS_URL: 'redis://127.0.0.1:6379' }, 'production')).toThrow(/loopback/i);
    expect(() => parseAdminServerEnv({ ...admin, NEXT_PUBLIC_SUPABASE_URL: 'http://0.0.0.0:54321' }, 'production')).toThrow(/loopback/i);
  });

  it('requires HTTPS service origins in production', () => {
    expect(() => parseMobileEnv({ ...mobile, EXPO_PUBLIC_API_ORIGIN: 'http://api.example.test' }, 'production')).toThrow(/https/i);
    expect(() => parseServerEnv({ ...server, SUPABASE_URL: 'http://project.supabase.co' }, 'production')).toThrow(/https/i);
  });

  it.each([
    'http://[::ffff:127.0.0.1]:3000',
    'http://[::ffff:7f00:1]:3000',
    'http://[::ffff:7f12:3456]:3000',
  ])('rejects IPv4-mapped IPv6 loopback URL %s', (origin) => {
    expect(() => parseMobileEnv({ ...mobile, EXPO_PUBLIC_API_ORIGIN: origin }, 'production')).toThrow(/loopback/i);
  });

  it('projects only the admin public allow-list', () => {
    const projected = projectAdminPublicEnv(parseAdminServerEnv(admin));
    expect(projected).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: admin.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: admin.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(projected).not.toHaveProperty('SUPABASE_SECRET_KEY');
  });

  it('does not permit server secrets in either public environment', () => {
    expect(() => parseMobileEnv({ ...mobile, DATABASE_URL: server.DATABASE_URL })).toThrow(/unknown.*DATABASE_URL/i);
    expect(projectAdminPublicEnv(parseAdminServerEnv(admin))).not.toHaveProperty('SUPABASE_SECRET_KEY');
    expect(() => parseAdminServerEnv({ ...admin, SUPABASE_SECRET_KEY: 'secret' })).toThrow(/unknown.*SUPABASE_SECRET_KEY/i);
    expect(() => parseServerEnv({ ...server, SUPABASE_SECRET_KEY: 'secret' })).toThrow(/unknown.*SUPABASE_SECRET_KEY/i);
  });
});
