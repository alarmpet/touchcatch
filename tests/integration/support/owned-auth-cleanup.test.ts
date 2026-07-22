import { describe, expect, it, vi } from 'vitest';
import { confirmOwnedAuthUserAbsent } from './owned-auth-cleanup.js';

describe('owned auth user cleanup postcondition', () => {
  it('checks the exact id and recipient after deletion', async () => {
    const query = vi.fn(async () => ({ rows: [{ value: false }] }));
    await expect(confirmOwnedAuthUserAbsent(query, 'owned-id', 'owned@example.test')).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/auth\.users/u), ['owned-id', 'owned@example.test']);
  });

  it('fails with a sanitized error when the exact user remains or the check times out', async () => {
    const remains = vi.fn(async () => ({ rows: [{ value: true }] }));
    await expect(confirmOwnedAuthUserAbsent(remains, 'private-id', 'private@example.test')).rejects.toThrow(/^LOCAL_AUTH_CLEANUP_FAILED$/u);
    const never = vi.fn(() => new Promise<{ rows: Array<{ value: boolean }> }>(() => undefined));
    await expect(confirmOwnedAuthUserAbsent(never, 'private-id', 'private@example.test', { timeoutMs: 5 })).rejects.toThrow(/^LOCAL_AUTH_CLEANUP_FAILED$/u);
  });
});
