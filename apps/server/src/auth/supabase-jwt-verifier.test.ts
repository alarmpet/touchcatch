import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { UnauthorizedError } from './bearer.js';
import { createSupabaseJwtVerifier } from './supabase-jwt-verifier.js';

const supabaseUrl = 'https://project-ref.supabase.co';
const issuer = `${supabaseUrl}/auth/v1`;
const subject = '10000000-0000-4000-8000-000000000001';

let privateKey: CryptoKey;
let alternatePrivateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
  const primary = await generateKeyPair('ES256');
  const alternate = await generateKeyPair('ES256');
  privateKey = primary.privateKey;
  alternatePrivateKey = alternate.privateKey;
  publicJwk = {
    ...await exportJWK(primary.publicKey),
    alg: 'ES256',
    kid: 'primary-key',
    use: 'sig',
  };
});

async function signToken(overrides: Readonly<{
  signingKey?: CryptoKey;
  issuer?: string;
  audience?: string;
  subject?: string;
  role?: string;
  isAnonymous?: boolean;
  expiresAt?: number;
}> = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    role: overrides.role ?? 'authenticated',
    is_anonymous: overrides.isAnonymous ?? false,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'primary-key' })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? 'authenticated')
    .setSubject(overrides.subject ?? subject)
    .setIssuedAt(now)
    .setExpirationTime(overrides.expiresAt ?? now + 60)
    .sign(overrides.signingKey ?? privateKey);
}

function verifier() {
  return createSupabaseJwtVerifier({
    supabaseUrl,
    fetchImpl: async (url) => {
      expect(url).toBe(`${issuer}/.well-known/jwks.json`);
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
}

function request(token: string): Request {
  return new Request('https://api.touchcatch.test/v1/pets', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe('Supabase JWKS bearer verification', () => {
  it('returns only the authenticated user ID from a valid asymmetric token', async () => {
    await expect(verifier().verify(request(await signToken()))).resolves.toEqual({
      authenticatedUserId: subject,
    });
  });

  it('maps signature and registered-claim failures to stable UNAUTHORIZED', async () => {
    const now = Math.floor(Date.now() / 1_000);
    const invalidTokens = await Promise.all([
      signToken({ signingKey: alternatePrivateKey }),
      signToken({ issuer: 'https://attacker.invalid/auth/v1' }),
      signToken({ audience: 'anon' }),
      signToken({ subject: 'not-a-uuid' }),
      signToken({ role: 'service_role' }),
      signToken({ isAnonymous: true }),
      signToken({ expiresAt: now - 60 }),
    ]);

    for (const token of invalidTokens) {
      await expect(verifier().verify(request(token))).rejects.toMatchObject({
        name: 'UnauthorizedError',
        code: 'UNAUTHORIZED',
      });
    }
  });

  it('maps malformed authorization input to the same public error', async () => {
    await expect(verifier().verify(new Request('https://api.touchcatch.test/v1/pets')))
      .rejects.toBeInstanceOf(UnauthorizedError);
  });
});
