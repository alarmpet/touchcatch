import { describe, expect, it } from 'vitest';
import { createAccountStore } from './ensure-account.js';

describe('account store', () => {
  it('uses exact security-definer projections without direct table access', async () => {
    const statements: string[] = [];
    const store = createAccountStore({ query: async (text, values) => {
      statements.push(text);
      expect(values).toEqual(['auth-sub']);
      return { rows: [{ value: { apiSubjectKey: 'api-key', economySubjectKey: 'economy-key', nickname: 'Player-12345678', points: 7 } }] };
    } });
    await expect(store.ensureAccount('auth-sub')).resolves.toBe(true);
    await expect(store.readMe('auth-sub')).resolves.toEqual({ profile: { displayName: 'Player-12345678' }, points: 7 });
    expect(statements).toEqual([
      'select private.ensure_account_v1($1::uuid) as value',
      'select private.read_me_v1($1::uuid) as value',
    ]);
  });

  it('fails closed on an absent projection row', async () => {
    const store = createAccountStore({ query: async () => ({ rows: [] }) });
    await expect(store.ensureAccount('auth-sub')).resolves.toBe(false);
    await expect(store.readMe('auth-sub')).rejects.toThrow(/ACCOUNT_SETUP_FAILED/);
  });
});
