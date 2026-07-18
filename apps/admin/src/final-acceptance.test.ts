import { describe, expect, it } from 'vitest';
import { parseAttestation } from './server/attestation.js';
import { parseAdminRuntimeEnv } from './server/env.js';
import { intakeUpload } from './server/intake.js';
import { readSessionCookie, sessionCookieHeaders } from './server/session-cookie.js';
import { isProvenDatabaseRejection, resolvePublishAfterTransportFailure } from './server/publish-protocol.js';

describe('final admin acceptance boundaries', () => {
  it('keeps the verified session secret in an HttpOnly strict cookie', () => {
    const headers = sessionCookieHeaders('opaque_session_123456', 'csrf_public_123456');
    expect(headers[0]).toMatch(/^admin_session=.*HttpOnly; Secure; SameSite=Strict/u);
    expect(headers[1]).toMatch(/^admin_csrf=.*Secure; SameSite=Strict/u);
    expect(headers[1]).not.toContain('HttpOnly');
    expect(readSessionCookie(`admin_csrf=x; admin_session=opaque_session_123456`)).toBe('opaque_session_123456');
  });

  it('rejects non-normalized and disguised JSON names', () => {
    const bytes = Buffer.from('{}');
    for (const filename of ['x.exe.json', 'x.json.exe', '../x.json', 'x\u0000.json', ' x.json ', 'X.JSON']) {
      expect(() => intakeUpload({ filename, mimeType: 'application/json', bytes })).toThrow('UPLOAD_FILENAME');
    }
  });

  it('strictly validates versioned attestation shape and time window before use', () => {
    const valid = { version: 1, artifactHash: 'a'.repeat(64), assetAHash: 'b'.repeat(64), assetBHash: 'c'.repeat(64), rightsHash: 'd'.repeat(64), actorRef: 'e'.repeat(43), sessionRef: 'f'.repeat(43), keyId: 'key-1', nonce: 'A'.repeat(32), issuedAt: 1_000, expiresAt: 31_000 };
    expect(parseAttestation(valid, { now: 1_000, keyId: 'key-1', maxTtlMs: 60_000, maxClockSkewMs: 1_000 })).toEqual(valid);
    for (const invalid of [{ ...valid, extra: true }, { ...valid, version: 2 }, { ...valid, issuedAt: 3_000 }, { ...valid, expiresAt: 100_000 }, { ...valid, expiresAt: Number.POSITIVE_INFINITY }, { ...valid, keyId: 'other' }]) {
      expect(() => parseAttestation(invalid, { now: 1_000, keyId: 'key-1', maxTtlMs: 60_000, maxClockSkewMs: 1_000 })).toThrow('ATTESTATION_INVALID');
    }
  });

  it('rejects whitespace-padded environment secrets', () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://auth.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public', ADMIN_ALLOWED_ORIGIN: 'https://admin.test', ADMIN_ATTESTATION_KEY: 'a'.repeat(32), ADMIN_AUDIT_KEY: 'b'.repeat(32), ADMIN_DATABASE_URL: 'postgres://x:y@localhost/db', CONTENT_ASSET_ORIGINS: 'https://cdn.test' };
    expect(() => parseAdminRuntimeEnv({ ...env, ADMIN_AUDIT_KEY: ` ${env.ADMIN_AUDIT_KEY}` })).toThrow('whitespace');
  });

  it('resolves commit-then-throw from the durable receipt without contradictory failure', async () => {
    await expect(resolvePublishAfterTransportFailure(async () => ({ state: 'COMPLETED', requestHash: 'a'.repeat(64), result: { contentRevisionId: 'revision-1' } }), 'a'.repeat(64))).resolves.toEqual({ kind: 'SUCCESS', contentRevisionId: 'revision-1' });
    await expect(resolvePublishAfterTransportFailure(async () => ({ state: 'PENDING', requestHash: 'a'.repeat(64), result: null }), 'a'.repeat(64))).resolves.toEqual({ kind: 'OUTCOME_UNKNOWN', retry: 'SAME_KEY' });
    await expect(resolvePublishAfterTransportFailure(async () => null, 'a'.repeat(64))).resolves.toEqual({ kind: 'ZERO_EFFECT' });
  });

  it('distinguishes SQL statement rollback from ambiguous connection loss',()=>{
    expect(isProvenDatabaseRejection(Object.assign(new Error('constraint'),{code:'22023'}))).toBe(true);
    expect(isProvenDatabaseRejection(Object.assign(new Error('connection'),{code:'08006'}))).toBe(false);
    expect(isProvenDatabaseRejection(new Error('socket closed'))).toBe(false);
  });
});
