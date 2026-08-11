import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  assertLoopbackSupabaseUrl,
  createLoopbackSupabaseJwtVerifier,
} from './loopback-supabase-jwt-verifier.js';

describe('loopback-only Supabase JWT verifier', () => {
  it('accepts only explicit HTTP loopback Supabase origins', () => {
    expect(assertLoopbackSupabaseUrl('http://127.0.0.1:55321')).toBe('http://127.0.0.1:55321');
    expect(() => assertLoopbackSupabaseUrl('https://project.supabase.co')).toThrow('loopback');
    expect(() => assertLoopbackSupabaseUrl('http://192.168.0.5:55321')).toThrow('loopback');
    const credentialedLoopback = new URL('http://127.0.0.1:55321');
    credentialedLoopback.username = ['local', 'user'].join('-');
    credentialedLoopback.password = ['not', 'a', 'secret'].join('-');
    expect(() => assertLoopbackSupabaseUrl(credentialedLoopback.toString())).toThrow('credential-free');
  });

  it('verifies an asymmetric local Supabase token without weakening production verification', async () => {
    const pair = await generateKeyPair('ES256');
    const jwk = { ...await exportJWK(pair.publicKey), kid: 'local-key', alg: 'ES256', use: 'sig' };
    const issuer = 'http://127.0.0.1:55321/auth/v1';
    const subject = '10000000-0000-4000-8000-000000000001';
    const token = await new SignJWT({ role: 'authenticated', is_anonymous: false })
      .setProtectedHeader({ alg: 'ES256', kid: 'local-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(pair.privateKey);
    const verifier = createLoopbackSupabaseJwtVerifier({
      supabaseUrl: 'http://127.0.0.1:55321',
      fetchImpl: async () => new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'content-type': 'application/json' },
      }),
    });
    await expect(verifier.verify(new Request('http://127.0.0.1:18787/v1/pets/collection', {
      headers: { authorization: `Bearer ${token}` },
    }))).resolves.toEqual({ authenticatedUserId: subject });
  });

  it('maps invalid claims to the stable unauthorized error', async () => {
    const pair = await generateKeyPair('ES256');
    const jwk = { ...await exportJWK(pair.publicKey), kid: 'local-key', alg: 'ES256', use: 'sig' };
    const token = await new SignJWT({ role: 'service_role', is_anonymous: false })
      .setProtectedHeader({ alg: 'ES256', kid: 'local-key' })
      .setIssuer('http://127.0.0.1:55321/auth/v1')
      .setAudience('authenticated')
      .setSubject('10000000-0000-4000-8000-000000000001')
      .setIssuedAt()
      .setExpirationTime('2m')
      .sign(pair.privateKey);
    const verifier = createLoopbackSupabaseJwtVerifier({
      supabaseUrl: 'http://127.0.0.1:55321',
      fetchImpl: async () => new Response(JSON.stringify({ keys: [jwk] })),
    });
    await expect(verifier.verify(new Request('http://127.0.0.1:18787/v1/pets/collection', {
      headers: { authorization: `Bearer ${token}` },
    }))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
