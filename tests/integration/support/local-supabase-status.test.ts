import { describe, expect, it, vi } from 'vitest';
import { loadHealthyLocalSupabaseStatus, loadLocalDatabaseUrl, loadLocalSupabaseStatus, type StatusCommand } from '../../support/local-supabase-status.js';

const explicit = {
  LOCAL_SUPABASE_API_URL: 'http://127.0.0.1:55321',
  TEST_DATABASE_URL: 'postgresql://fixture@127.0.0.1:55322/postgres',
  LOCAL_MAILPIT_URL: 'http://127.0.0.1:55324',
  LOCAL_SUPABASE_PUBLISHABLE_KEY: 'fixture-public-key',
  LOCAL_SUPABASE_SECRET_KEY: 'fixture-cleanup-key',
};

describe('local Supabase status discovery', () => {
  it('uses complete explicit process env without starting the CLI', () => {
    const runStatus = vi.fn<StatusCommand>();
    const status = loadLocalSupabaseStatus({ env: explicit, runStatus });
    expect(status).toEqual({
      apiUrl: explicit.LOCAL_SUPABASE_API_URL,
      dbUrl: explicit.TEST_DATABASE_URL,
      mailpitUrl: explicit.LOCAL_MAILPIT_URL,
      publishableKey: explicit.LOCAL_SUPABASE_PUBLISHABLE_KEY,
      cleanupKey: explicit.LOCAL_SUPABASE_SECRET_KEY,
    });
    expect(runStatus).not.toHaveBeenCalled();
  });

  it('uses the bounded project-local CLI with telemetry disabled as an in-memory fallback', () => {
    const runStatus = vi.fn<StatusCommand>(() => [
      'API_URL="http://127.0.0.1:55321"',
      'DB_URL="postgresql://fixture@127.0.0.1:55322/postgres"',
      'MAILPIT_URL="http://127.0.0.1:55324"',
      'PUBLISHABLE_KEY="fixture-public-key"',
      'SECRET_KEY="fixture-cleanup-key"',
    ].join('\n'));
    const status = loadLocalSupabaseStatus({ env: {}, runStatus });
    expect(status.apiUrl).toBe('http://127.0.0.1:55321');
    expect(runStatus).toHaveBeenCalledOnce();
    const command = runStatus.mock.calls[0]?.[0];
    expect(command?.executable).toBe(process.execPath);
    expect(command?.args.slice(1)).toEqual(['status', '-o', 'env']);
    expect(command?.options.timeout).toBe(10_000);
    expect(command?.options.maxBuffer).toBe(1024 * 1024);
    expect(command?.options.windowsHide).toBe(true);
    expect(command?.options.env.SUPABASE_TELEMETRY_DISABLED).toBe('1');
    expect(command?.options.env.DO_NOT_TRACK).toBe('1');
  });

  it('fails with a sanitized error for CLI failure or non-loopback status', () => {
    const failed = vi.fn<StatusCommand>(() => { throw new Error('raw-output-must-not-escape'); });
    expect(() => loadLocalSupabaseStatus({ env: {}, runStatus: failed })).toThrow(/^LOCAL_SUPABASE_UNAVAILABLE$/u);
    expect(() => loadLocalSupabaseStatus({ env: { ...explicit, LOCAL_SUPABASE_API_URL: 'https://remote.example.test' } })).toThrow(/^LOCAL_SUPABASE_UNAVAILABLE$/u);
  });

  it('checks the fixed health endpoint with a two-second signal before status discovery', async () => {
    const order: string[] = [];
    const signal = new AbortController().signal;
    const timeoutSignal = vi.fn((milliseconds: number) => { order.push(`timeout:${milliseconds}`); return signal; });
    const fetchHealth = vi.fn(async (input: string | URL, init?: RequestInit) => {
      order.push(`health:${String(input)}`);
      expect(init?.method).toBe('GET');
      expect(init?.signal).toBe(signal);
      return new Response(null, { status: 200 });
    });
    const loadStatus = vi.fn(() => { order.push('status'); return loadLocalSupabaseStatus({ env: explicit }); });

    await expect(loadHealthyLocalSupabaseStatus({ fetchHealth, loadStatus, timeoutSignal })).resolves.toMatchObject({ apiUrl: explicit.LOCAL_SUPABASE_API_URL });
    expect(order).toEqual(['timeout:2000', 'health:http://127.0.0.1:55321/auth/v1/health', 'status']);
  });

  it('uses the same bounded sanitized fallback for database-only callers', () => {
    const runStatus = vi.fn<StatusCommand>(() => 'DB_URL="postgresql://fixture@127.0.0.1:55322/postgres"');
    expect(loadLocalDatabaseUrl({ env: {}, runStatus }).toString()).toBe('postgresql://fixture@127.0.0.1:55322/postgres');
    const command = runStatus.mock.calls[0]?.[0];
    expect(command?.options).toMatchObject({ cwd: expect.any(String), timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true });
    expect(command?.options.env).toMatchObject({ SUPABASE_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1' });
    expect(() => loadLocalDatabaseUrl({ env: {}, runStatus: () => { throw new Error('raw-db-output'); } })).toThrow(/^LOCAL_SUPABASE_UNAVAILABLE$/u);
  });
});
