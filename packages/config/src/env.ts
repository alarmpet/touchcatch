type RawEnv = Readonly<Record<string, string | undefined>>;

const mobileKeys = [
  'EXPO_PUBLIC_API_ORIGIN',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_POSTHOG_KEY',
  'EXPO_PUBLIC_SENTRY_DSN',
] as const;
const serverKeys = ['PORT', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL', 'REDIS_URL', 'SENTRY_DSN'] as const;
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

function unbracketHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/gu, '').toLowerCase();
}

function isMappedIpv4Loopback(hostname: string): boolean {
  return hostname === '::ffff:127.0.0.1' || /^::ffff:7f[0-9a-f]{2}:/u.test(hostname);
}

/** Bind-address loopback. `0.0.0.0` is a wildcard listen address, not loopback. */
export function isLoopbackHostname(hostname: string): boolean {
  const unbracketed = unbracketHostname(hostname);
  return hostname.toLowerCase() === 'localhost'
    || hostname === '127.0.0.1'
    || unbracketed === '::1'
    || isMappedIpv4Loopback(unbracketed);
}

function isLoopbackServiceHostname(hostname: string): boolean {
  const unbracketed = unbracketHostname(hostname);
  return isLoopbackHostname(hostname) || hostname === '0.0.0.0' || unbracketed === '0.0.0.0';
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
    if (isLoopbackServiceHostname(hostname)) {
      throw new Error(`${key} must not use a loopback URL in production`);
    }
  }
}

function optional(raw: RawEnv, name: string): string | undefined {
  const value = raw[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function parsePortValue(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/u.test(value)) throw new Error(`${name} must be an integer from 1 to 65535`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 to 65535`);
  }
  return port;
}

function parseDatabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be an absolute PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  }
  return value;
}

function parseSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('SUPABASE_URL must be a valid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('SUPABASE_URL must be a credential-free HTTPS URL');
  }
  return value;
}

function parseAllowedOrigins(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') return [];
  const origins = value.split(',').map((entry) => entry.trim());
  if (origins.some((entry) => entry === '')) throw new Error('MOBILE_API_ALLOWED_ORIGINS contains an empty origin');
  return origins.map((entry) => {
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error('MOBILE_API_ALLOWED_ORIGINS must contain absolute HTTP origins');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || url.origin !== entry) {
      throw new Error('MOBILE_API_ALLOWED_ORIGINS must contain exact credential-free HTTP origins');
    }
    return url.origin;
  });
}

function parseOptionalServiceUrl(value: string, name: string): string {
  try {
    void new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  return value;
}

export function resolveEnvironment(raw: RawEnv): Environment {
  const nodeEnv = optional(raw, 'NODE_ENV');
  const touchcatchEnv = optional(raw, 'TOUCHCATCH_ENV');
  if (nodeEnv !== undefined && touchcatchEnv !== undefined && nodeEnv !== touchcatchEnv) {
    throw new Error('NODE_ENV and TOUCHCATCH_ENV must not disagree');
  }
  const value = (touchcatchEnv ?? nodeEnv ?? 'development').toLowerCase();
  if (value === 'production' || value === 'test' || value === 'development') return value;
  throw new Error('NODE_ENV must be development, test, or production');
}

export type MobileApiEnv = Readonly<{
  environment: Environment;
  host: string;
  port: number;
  allowedOrigins: readonly string[];
  supabaseUrl: string;
  databaseUrl: string;
  redisUrl: string | undefined;
  sentryDsn: string | undefined;
}>;

/**
 * Process env for the shipping Android casual-beta HTTP API.
 * Reads known keys from a larger env (does not reject PATH and friends).
 * REDIS_URL and SENTRY_DSN are optional until PvP/telemetry adapters exist.
 * Production fails closed on loopback bind hosts, empty origin allow-lists,
 * loopback service URLs, and NODE_ENV / TOUCHCATCH_ENV disagreement.
 */
export function parseMobileApiEnv(raw: RawEnv, environment: Environment = resolveEnvironment(raw)): MobileApiEnv {
  const supabaseUrl = optional(raw, 'SUPABASE_URL');
  const databaseUrl = optional(raw, 'DATABASE_URL');
  if (supabaseUrl === undefined) throw new Error('SUPABASE_URL is required');
  if (databaseUrl === undefined) throw new Error('DATABASE_URL is required');

  const mobilePort = optional(raw, 'MOBILE_API_PORT');
  const plannedPort = optional(raw, 'PORT');
  if (mobilePort !== undefined && plannedPort !== undefined && mobilePort !== plannedPort) {
    throw new Error('PORT and MOBILE_API_PORT must not disagree');
  }

  const host = optional(raw, 'MOBILE_API_HOST') ?? (environment === 'production' ? undefined : '127.0.0.1');
  if (host === undefined) throw new Error('MOBILE_API_HOST is required in production');
  if (environment === 'production' && isLoopbackHostname(host)) {
    throw new Error('MOBILE_API_HOST must not use a loopback address in production');
  }

  const allowedOrigins = parseAllowedOrigins(optional(raw, 'MOBILE_API_ALLOWED_ORIGINS'));
  if (environment === 'production') {
    if (allowedOrigins.length === 0) throw new Error('MOBILE_API_ALLOWED_ORIGINS is required in production');
    if (allowedOrigins.some((origin) => isLoopbackHostname(new URL(origin).hostname))) {
      throw new Error('MOBILE_API_ALLOWED_ORIGINS must not use a loopback origin in production');
    }
  }

  const redisUrl = optional(raw, 'REDIS_URL');
  const sentryDsn = optional(raw, 'SENTRY_DSN');
  const parsed = {
    SUPABASE_URL: parseSupabaseUrl(supabaseUrl),
    DATABASE_URL: parseDatabaseUrl(databaseUrl),
    ...(redisUrl === undefined ? {} : { REDIS_URL: parseOptionalServiceUrl(redisUrl, 'REDIS_URL') }),
    ...(sentryDsn === undefined ? {} : { SENTRY_DSN: parseOptionalServiceUrl(sentryDsn, 'SENTRY_DSN') }),
  };
  rejectProductionLoopback(parsed, environment, ['SUPABASE_URL', 'DATABASE_URL', 'REDIS_URL', 'SENTRY_DSN']);

  return {
    environment,
    host,
    port: parsePortValue(mobilePort ?? plannedPort, mobilePort === undefined ? 'PORT' : 'MOBILE_API_PORT', 8787),
    allowedOrigins,
    supabaseUrl: parsed.SUPABASE_URL,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    sentryDsn: parsed.SENTRY_DSN,
  };
}

export function parseMobileEnv(raw: RawEnv, environment: Environment = 'development'): MobileEnv {
  const parsed = parseExact(raw, mobileKeys);
  rejectProductionLoopback(parsed, environment, ['EXPO_PUBLIC_API_ORIGIN', 'EXPO_PUBLIC_SUPABASE_URL']);
  return parsed;
}

/** Planned PvP+telemetry process env. Exact allow-list; REDIS_URL and SENTRY_DSN are required. The shipping mobile API uses parseMobileApiEnv. */
export function parseServerEnv(raw: RawEnv, environment: Environment = 'development'): ServerEnv {
  const parsed = parseExact(raw, serverKeys);
  rejectProductionLoopback(parsed, environment, ['SUPABASE_URL', 'DATABASE_URL', 'REDIS_URL']);
  const port = Number(parsed.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
  return { ...parsed, PORT: port };
}

export function parseAdminServerEnv(raw: RawEnv, environment: Environment = 'development'): AdminServerEnv {
  const parsed = parseExact(raw, adminKeys);
  rejectProductionLoopback(parsed, environment, ['NEXT_PUBLIC_SUPABASE_URL']);
  return parsed;
}

export function projectAdminPublicEnv(env: AdminServerEnv): Pick<AdminServerEnv, 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
