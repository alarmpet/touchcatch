import { describe, expect, it } from 'vitest';
import { authenticateSocket } from './authenticate.js';

describe('Socket ingress', () => {
  it('uses the shared verifier and returns only auth context', async () => {
    await expect(authenticateSocket({ accessToken: 'token-value' }, async (token) => ({ authSub: `verified:${token}`, isAnonymous: false }))).resolves.toEqual({ authSub: 'verified:token-value', isAnonymous: false });
  });

  it('rejects missing and anonymous access tokens', async () => {
    await expect(authenticateSocket({}, async () => ({ authSub: 'x', isAnonymous: false }))).rejects.toThrow(/unauthorized/i);
    await expect(authenticateSocket({ accessToken: 'token-value' }, async () => ({ authSub: 'x', isAnonymous: true }))).rejects.toThrow(/anonymous/i);
  });
});
