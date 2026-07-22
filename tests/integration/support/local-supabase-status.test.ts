import { describe, expect, it, vi } from 'vitest';
import { loadLocalSupabaseStatus, type StatusCommand } from './local-supabase-status.js';

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
});
