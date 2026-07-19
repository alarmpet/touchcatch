import type { VerifiedIdentity } from '../auth/verify.js';

export async function authenticateSocket(
  handshake: Readonly<{ accessToken?: string }>,
  verifyAccessToken: (token: string) => Promise<VerifiedIdentity>,
  ensureAccountActive: (authSub: string) => Promise<boolean>,
): Promise<VerifiedIdentity> {
  if (!handshake.accessToken) throw new Error('UNAUTHORIZED');
  const identity = await verifyAccessToken(handshake.accessToken);
  if (identity.isAnonymous) throw new Error('ANONYMOUS_FORBIDDEN');
  if (!await ensureAccountActive(identity.authSub)) throw new Error('ACCOUNT_DELETING');
  return identity;
}
