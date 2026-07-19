import { describe, expect, it } from 'vitest';
import { authenticateSocket } from './authenticate.js';

describe('Socket ingress', () => {
  it('uses the shared verifier and returns only auth context', async () => {
    await expect(authenticateSocket({ accessToken: 'token-value' }, async (token) => ({ authSub: `verified:${token}`, isAnonymous: false }), async () => true)).resolves.toEqual({ authSub: 'verified:token-value', isAnonymous: false });
  });

  it('rejects missing and anonymous access tokens', async () => {
    await expect(authenticateSocket({}, async () => ({ authSub: 'x', isAnonymous: false }), async () => true)).rejects.toThrow(/unauthorized/i);
    await expect(authenticateSocket({ accessToken: 'token-value' }, async () => ({ authSub: 'x', isAnonymous: true }), async () => true)).rejects.toThrow(/anonymous/i);
  });

  it('rejects an already-issued token when the DB account gate is no longer active', async () => {
    await expect(authenticateSocket({ accessToken: 'still-valid' }, async () => ({ authSub: 'deleting-user', isAnonymous: false }), async () => false)).rejects.toThrow(/ACCOUNT_DELETING/);
  });
});
