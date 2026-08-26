import { describe, expect, it } from 'vitest';
import { parseAdminServerEnv, parseMobileApiEnv, parseMobileEnv, parseServerEnv, projectAdminPublicEnv } from './env.js';

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
  });
});

const mobileApi = {
  SUPABASE_URL: 'https://project.supabase.co',
  DATABASE_URL: 'postgresql://user:pass@db.example.test/db',
};

describe('mobile API runtime environment', () => {
  it('defaults to loopback bind and optional redis/telemetry outside production', () => {
    expect(parseMobileApiEnv({ ...mobileApi, PATH: '/usr/bin' })).toEqual({
      environment: 'development',
      host: '127.0.0.1',
      port: 8787,
      allowedOrigins: [],
      supabaseUrl: mobileApi.SUPABASE_URL,
      databaseUrl: mobileApi.DATABASE_URL,
      redisUrl: undefined,
      sentryDsn: undefined,
    });
  });

  it('fails closed in production for loopback host, empty origins, and disagreeing env names', () => {
    const production = { ...mobileApi, NODE_ENV: 'production' };
    expect(() => parseMobileApiEnv(production)).toThrow(/MOBILE_API_HOST is required in production/i);
    expect(() => parseMobileApiEnv({ ...production, MOBILE_API_HOST: '127.0.0.1' })).toThrow(/loopback/i);
    expect(() => parseMobileApiEnv({
      ...production, MOBILE_API_HOST: '0.0.0.0', MOBILE_API_ALLOWED_ORIGINS: '',
    })).toThrow(/MOBILE_API_ALLOWED_ORIGINS is required in production/i);
    expect(() => parseMobileApiEnv({
      ...production,
      MOBILE_API_HOST: '0.0.0.0',
      MOBILE_API_ALLOWED_ORIGINS: 'https://app.example',
      DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/db',
    })).toThrow(/loopback/i);
    expect(() => parseMobileApiEnv({
      ...mobileApi, NODE_ENV: 'production', TOUCHCATCH_ENV: 'development',
    })).toThrow(/disagree/i);
    expect(() => parseMobileApiEnv({ ...mobileApi, PORT: '8787', MOBILE_API_PORT: '9000' })).toThrow(/disagree/i);
  });

  it('accepts a public bind host and origin allow-list in production, with optional redis and sentry', () => {
    const parsed = parseMobileApiEnv({
      ...mobileApi,
      NODE_ENV: 'production',
      MOBILE_API_HOST: '0.0.0.0',
      MOBILE_API_PORT: '443',
      MOBILE_API_ALLOWED_ORIGINS: 'https://app.example',
      REDIS_URL: 'rediss://redis.example.test:6379',
      SENTRY_DSN: 'https://public@sentry.example.test/1',
    });
    expect(parsed).toMatchObject({
      environment: 'production',
      host: '0.0.0.0',
      port: 443,
      allowedOrigins: ['https://app.example'],
      redisUrl: 'rediss://redis.example.test:6379',
      sentryDsn: 'https://public@sentry.example.test/1',
    });
  });

  it('rejects production loopback origins and optional redis even when other fields are valid', () => {
    const production = {
      ...mobileApi,
      NODE_ENV: 'production',
      MOBILE_API_HOST: '0.0.0.0',
      MOBILE_API_ALLOWED_ORIGINS: 'https://app.example',
    };
    expect(() => parseMobileApiEnv({
      ...production, MOBILE_API_ALLOWED_ORIGINS: 'http://localhost:8081',
    })).toThrow(/loopback origin/i);
    expect(() => parseMobileApiEnv({
      ...production, REDIS_URL: 'redis://127.0.0.1:6379',
    })).toThrow(/loopback/i);
  });
});
