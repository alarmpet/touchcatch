import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createAccessTokenVerifier } from './verify.js';

const issuer = 'https://project.supabase.co/auth/v1';

async function fixture() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'active', alg: 'ES256', use: 'sig' };
  const sign = (claims: Record<string, unknown> = {}, header = { alg: 'ES256', kid: 'active' }) => {
    const jwt = new SignJWT({ role: 'authenticated', is_anonymous: false }).setProtectedHeader(header).setSubject('10000000-0000-4000-8000-000000000001').setIssuer(String(claims.iss ?? issuer)).setAudience(String(claims.aud ?? 'authenticated')).setIssuedAt().setExpirationTime('5m');
    return jwt.sign(privateKey);
  };
  return { jwk, sign };
}

describe('Supabase access-token verifier', () => {
  it('accepts an ES256 token with exact issuer and audience', async () => {
    const { jwk, sign } = await fixture();
    const verifier = createAccessTokenVerifier({ supabaseUrl: 'https://project.supabase.co/', loadJwks: async () => ({ keys: [jwk] }) });
    await expect(verifier.verifyAccessToken(await sign())).resolves.toEqual({ authSub: '10000000-0000-4000-8000-000000000001', isAnonymous: false });
  });

  it.each([
    [{ iss: 'https://attacker.test/auth/v1' }, /iss|issuer/i],
    [{ aud: 'service_role' }, /aud|audience/i],
  ])('rejects claim mismatch %j', async (claims, error) => {
    const { jwk, sign } = await fixture();
    const verifier = createAccessTokenVerifier({ supabaseUrl: 'https://project.supabase.co', loadJwks: async () => ({ keys: [jwk] }) });
    await expect(verifier.verifyAccessToken(await sign(claims))).rejects.toThrow(error);
  });

  it('refreshes JWKS once for a previously unknown key', async () => {
    const { jwk, sign } = await fixture();
    let calls = 0;
    const verifier = createAccessTokenVerifier({ supabaseUrl: 'https://project.supabase.co', loadJwks: async () => ({ keys: ++calls === 1 ? [] : [jwk] }) });
    await expect(verifier.verifyAccessToken(await sign())).resolves.toMatchObject({ isAnonymous: false });
    expect(calls).toBe(2);
  });

  it('rejects algorithms outside the exact asymmetric allow-list before key lookup', async () => {
    const verifier = createAccessTokenVerifier({ supabaseUrl: 'https://project.supabase.co', loadJwks: async () => ({ keys: [] }) });
    const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'legacy' })).toString('base64url')}.${Buffer.from('{}').toString('base64url')}.signature`;
    await expect(verifier.verifyAccessToken(token)).rejects.toThrow(/algorithm/i);
  });
});
