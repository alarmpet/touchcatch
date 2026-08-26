import { describe, expect, it } from 'vitest';
import { parsePrivacyWorkerEnv, PrivacyWorkerEnvError } from './privacy-worker-env.js';

const valid = {
  PRIVACY_WORKER_DATABASE_URL: 'postgres://privacy_worker_login@db.example:5432/postgres',
  PRIVACY_WORKER_SUPABASE_URL: 'https://project.supabase.co',
  PRIVACY_WORKER_SERVICE_ROLE_KEY: 'sb_secret_example',
} as const;

describe('privacy worker environment', () => {
  it('accepts the worker-only configuration', () => {
    const env = parsePrivacyWorkerEnv(valid);
    expect(env.supabaseUrl).toBe('https://project.supabase.co');
    expect(env.leaseSeconds).toBe(60);
    expect(env.pollMs).toBe(5000);
  });

  it('refuses to start when the API database url is present', () => {
    // A deploy that copies the API env block into the worker gives it economy_server's login.
    // Booting anyway would silently undo the role split the migration exists to create.
    expect(() =>
      parsePrivacyWorkerEnv({ ...valid, DATABASE_URL: 'postgres://economy_server@db/postgres' }),
    ).toThrow(PrivacyWorkerEnvError);
    expect(() =>
      parsePrivacyWorkerEnv({ ...valid, DATABASE_URL: 'postgres://economy_server@db/postgres' }),
    ).toThrow('API_ENV_PRESENT:DATABASE_URL');
  });

  it('refuses the API secret key too', () => {
    expect(() => parsePrivacyWorkerEnv({ ...valid, SUPABASE_SECRET_KEY: 'x' })).toThrow(
      'API_ENV_PRESENT:SUPABASE_SECRET_KEY',
    );
  });

  it('requires every credential', () => {
    for (const key of Object.keys(valid)) {
      const partial = { ...valid, [key]: '' };
      expect(() => parsePrivacyWorkerEnv(partial), key).toThrow(`${key}_REQUIRED`);
    }
  });

  it('refuses plaintext http for a remote supabase', () => {
    expect(() =>
      parsePrivacyWorkerEnv({ ...valid, PRIVACY_WORKER_SUPABASE_URL: 'http://project.supabase.co' }),
    ).toThrow('PRIVACY_WORKER_SUPABASE_URL_INSECURE');
  });

  it('allows plaintext loopback for the local stack', () => {
    const env = parsePrivacyWorkerEnv({
      ...valid,
      PRIVACY_WORKER_SUPABASE_URL: 'http://127.0.0.1:55321',
    });
    expect(env.supabaseUrl).toBe('http://127.0.0.1:55321');
  });

  it('rejects a misspelled worker key instead of ignoring it', () => {
    expect(() =>
      parsePrivacyWorkerEnv({ ...valid, PRIVACY_WORKER_LEASE_SECOND: '30' }),
    ).toThrow('UNKNOWN_KEYS:PRIVACY_WORKER_LEASE_SECOND');
  });

  it('bounds the lease and poll values', () => {
    expect(() => parsePrivacyWorkerEnv({ ...valid, PRIVACY_WORKER_LEASE_SECONDS: '0' })).toThrow(
      'PRIVACY_WORKER_LEASE_SECONDS_OUT_OF_RANGE',
    );
    expect(() => parsePrivacyWorkerEnv({ ...valid, PRIVACY_WORKER_POLL_MS: 'soon' })).toThrow(
      'PRIVACY_WORKER_POLL_MS_NOT_A_NUMBER',
    );
  });
});
