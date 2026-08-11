import { describe, expect, it } from 'vitest';
import { assertLocalAcceptanceEnvironment } from './local-acceptance-guard.js';

describe('local acceptance environment guard', () => {
  it('accepts only the explicit marker with loopback Supabase and PostgreSQL endpoints', () => {
    expect(assertLocalAcceptanceEnvironment({
      marker: 'TOUCHCATCH_LOCAL_ACCEPTANCE_V1',
      supabaseUrl: 'http://127.0.0.1:55321',
      databaseUrl: 'postgresql://local-runtime@localhost:55322/postgres',
    })).toEqual({ supabaseOrigin: 'http://127.0.0.1:55321', databaseHost: 'localhost' });
  });

  it.each([
    { marker: '', supabaseUrl: 'http://127.0.0.1:55321', databaseUrl: 'postgresql://local-runtime@127.0.0.1:55322/postgres' },
    { marker: 'TOUCHCATCH_LOCAL_ACCEPTANCE_V1', supabaseUrl: 'https://project.supabase.co', databaseUrl: 'postgresql://local-runtime@127.0.0.1:55322/postgres' },
    { marker: 'TOUCHCATCH_LOCAL_ACCEPTANCE_V1', supabaseUrl: 'http://127.0.0.1:55321', databaseUrl: 'postgresql://runtime@db.example.test:5432/app' },
  ])('rejects a non-local or unconfirmed environment', (input) => {
    expect(() => assertLocalAcceptanceEnvironment(input)).toThrow(/local acceptance/i);
  });
});
