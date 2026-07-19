type RawEnv = Readonly<Record<string, string | undefined>>;

const mobileKeys = [
  'EXPO_PUBLIC_API_ORIGIN',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_POSTHOG_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
] as const;
const serverKeys = ['PORT', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL', 'REDIS_URL', 'SENTRY_DSN'] as const;
const adminKeys = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;

type MobileEnv = Record<(typeof mobileKeys)[number], string>;
type ServerEnv = Omit<Record<(typeof serverKeys)[number], string>, 'PORT'> & { PORT: number };
type AdminServerEnv = Record<(typeof adminKeys)[number], string>;
export type Environment = 'development' | 'test' | 'production';

function parseExact<const Keys extends readonly string[]>(raw: RawEnv, keys: Keys): Record<Keys[number], string> {
  const allowed = new Set<string>(keys);
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unknown environment keys: ${unknown.join(', ')}`);

  return Object.fromEntries(keys.map((key) => {
    const value = raw[key];
    if (value === undefined || value.trim() === '') throw new Error(`${key} must not be empty`);
    return [key, value];
  })) as Record<Keys[number], string>;
}

function rejectProductionLoopback(values: RawEnv, environment: Environment, urlKeys: readonly string[]): void {
  if (environment !== 'production') return;
  for (const key of urlKeys) {
    const value = values[key];
    if (!value) continue;
    let hostname: string;
    try {
      hostname = new URL(value).hostname.toLowerCase();
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }
    const unbracketedHostname = hostname.replace(/^\[|\]$/gu, '');
    const mappedIpv4Loopback = /^::ffff:7f[0-9a-f]{2}:/u.test(unbracketedHostname);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || unbracketedHostname === '::1' || mappedIpv4Loopback) {
      throw new Error(`${key} must not use a loopback URL in production`);
    }
  }
}

function requireProductionHttps(values: RawEnv, environment: Environment, urlKeys: readonly string[]): void {
  if (environment !== 'production') return;
  for (const key of urlKeys) {
    const value = values[key];
    if (!value) continue;
    let protocol: string;
    try { protocol = new URL(value).protocol; } catch { throw new Error(`${key} must be a valid URL`); }
    if (protocol !== 'https:') throw new Error(`${key} must use HTTPS in production`);
  }
}

export function parseMobileEnv(raw: RawEnv, environment: Environment = 'development'): MobileEnv {
  const parsed = parseExact(raw, mobileKeys);
  rejectProductionLoopback(parsed, environment, ['EXPO_PUBLIC_API_ORIGIN', 'EXPO_PUBLIC_SUPABASE_URL']);
  requireProductionHttps(parsed, environment, ['EXPO_PUBLIC_API_ORIGIN', 'EXPO_PUBLIC_SUPABASE_URL']);
  return parsed;
}

export function parseServerEnv(raw: RawEnv, environment: Environment = 'development'): ServerEnv {
  const parsed = parseExact(raw, serverKeys);
  rejectProductionLoopback(parsed, environment, ['SUPABASE_URL', 'DATABASE_URL', 'REDIS_URL']);
  requireProductionHttps(parsed, environment, ['SUPABASE_URL']);
  const port = Number(parsed.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
  return { ...parsed, PORT: port };
}

export function parseAdminServerEnv(raw: RawEnv, environment: Environment = 'development'): AdminServerEnv {
  const parsed = parseExact(raw, adminKeys);
  rejectProductionLoopback(parsed, environment, ['NEXT_PUBLIC_SUPABASE_URL']);
  requireProductionHttps(parsed, environment, ['NEXT_PUBLIC_SUPABASE_URL']);
  return parsed;
}

export function projectAdminPublicEnv(env: AdminServerEnv): Pick<AdminServerEnv, 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
