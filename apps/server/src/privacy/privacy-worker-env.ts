/**
 * The worker's environment, kept deliberately disjoint from the API's.
 *
 * The API must never hold the service-role key, and the worker must never hold the API's database
 * login. Two processes with two secrets is the whole point of splitting them: if the API could
 * read this configuration, the separation enforced by the grants in 202608260003 would be one
 * misconfiguration away from nothing.
 *
 * So parsing is exact in both directions — an unexpected key is an error, and so is an API key
 * appearing here. A worker that boots with `DATABASE_URL` set has almost certainly been handed the
 * API's connection string by a deploy script that copied the wrong env block, and it must not
 * start and quietly run as `economy_server`.
 */

type RawEnv = Readonly<Record<string, string | undefined>>;

const workerKeys = [
  'PRIVACY_WORKER_DATABASE_URL',
  'PRIVACY_WORKER_SUPABASE_URL',
  'PRIVACY_WORKER_SERVICE_ROLE_KEY',
  'PRIVACY_WORKER_LEASE_SECONDS',
  'PRIVACY_WORKER_POLL_MS',
] as const;

/** Keys that belong to the API process. Their presence here is a deployment mistake. */
const apiOnlyKeys = [
  'DATABASE_URL',
  'SUPABASE_SECRET_KEY',
  'MOBILE_API_PORT',
  'MOBILE_API_HOST',
  'MOBILE_API_ALLOWED_ORIGINS',
] as const;

export type PrivacyWorkerEnv = Readonly<{
  databaseUrl: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  leaseSeconds: number;
  pollMs: number;
}>;

export class PrivacyWorkerEnvError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'PrivacyWorkerEnvError';
  }
}

function requirePositiveInteger(value: string, key: string, fallbackMax: number): number {
  if (!/^\d+$/u.test(value)) throw new PrivacyWorkerEnvError(`${key}_NOT_A_NUMBER`);
  const parsed = Number(value);
  if (parsed <= 0 || parsed > fallbackMax) throw new PrivacyWorkerEnvError(`${key}_OUT_OF_RANGE`);
  return parsed;
}

export function parsePrivacyWorkerEnv(raw: RawEnv): PrivacyWorkerEnv {
  const leaked = apiOnlyKeys.filter((key) => (raw[key] ?? '').trim() !== '');
  if (leaked.length > 0) {
    throw new PrivacyWorkerEnvError(`API_ENV_PRESENT:${leaked.join(',')}`);
  }

  for (const key of ['PRIVACY_WORKER_DATABASE_URL', 'PRIVACY_WORKER_SUPABASE_URL', 'PRIVACY_WORKER_SERVICE_ROLE_KEY'] as const) {
    if ((raw[key] ?? '').trim() === '') throw new PrivacyWorkerEnvError(`${key}_REQUIRED`);
  }

  const supabaseUrl = raw.PRIVACY_WORKER_SUPABASE_URL!.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new PrivacyWorkerEnvError('PRIVACY_WORKER_SUPABASE_URL_INVALID');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
    // The service-role key travels on this connection. Plaintext is only tolerable against a
    // loopback stack on the developer's own machine.
    throw new PrivacyWorkerEnvError('PRIVACY_WORKER_SUPABASE_URL_INSECURE');
  }

  const unknown = Object.keys(raw).filter(
    (key) => !(workerKeys as readonly string[]).includes(key) && key.startsWith('PRIVACY_WORKER_'),
  );
  if (unknown.length > 0) throw new PrivacyWorkerEnvError(`UNKNOWN_KEYS:${unknown.join(',')}`);

  return {
    databaseUrl: raw.PRIVACY_WORKER_DATABASE_URL!.trim(),
    supabaseUrl,
    serviceRoleKey: raw.PRIVACY_WORKER_SERVICE_ROLE_KEY!.trim(),
    leaseSeconds: requirePositiveInteger(raw.PRIVACY_WORKER_LEASE_SECONDS?.trim() || '60', 'PRIVACY_WORKER_LEASE_SECONDS', 3600),
    pollMs: requirePositiveInteger(raw.PRIVACY_WORKER_POLL_MS?.trim() || '5000', 'PRIVACY_WORKER_POLL_MS', 300_000),
  };
}
