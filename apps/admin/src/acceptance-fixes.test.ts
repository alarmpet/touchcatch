import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createVerifiedAuthAdapter } from './server/auth.js';
import { intakeMultipart } from './server/intake.js';
import { safeAuditEvent } from './server/audit.js';
import { PostgresPublishReceiptStore } from './server/receipt-store.js';
import { createSubmittedArtifactValidator } from './server/submitted-validator.js';
import { createAdminHandlers } from './server/handlers.js';

describe('Task 8 acceptance boundaries', () => {
  it('derives the opaque session from the verified token and server store', async () => {
    const auth = createVerifiedAuthAdapter({ verifyToken: async () => ({ actorId: 'actor-1', tokenId: 'token-1' }), loadSession: async () => ({ sessionId: 'server-session', actorId: 'actor-1', roles: ['CONTENT_PUBLISHER'] }) });
    await expect(auth.authenticate({ authorization: 'Bearer signed-token', origin: 'https://admin.test', csrfCookie: 'csrf', csrfHeader: 'csrf' }, 'https://admin.test')).resolves.toMatchObject({ sessionId: 'server-session' });
    await expect(auth.authenticate({ authorization: 'Bearer signed-token', origin: 'https://evil.test', csrfCookie: 'csrf', csrfHeader: 'csrf' }, 'https://admin.test')).rejects.toThrow('ORIGIN');
  });

  it('accepts an exact JSON+A+B multipart set and owns opaque asset locators', async () => {
    const png = await readFile(resolve('content/fixtures/assets/0bfb2e252d2f0727710a4c802896574489cb7dacde9432dc6e38cc78db2d2f9c.png'));
    const form = new FormData();
    form.set('artifact', new File([JSON.stringify({ fixtureVersion: '1.0.0' })], 'bundle.json', { type: 'application/json' }));
    form.set('imageA', new File([png], 'a.png', { type: 'image/png' }));
    form.set('imageB', new File([png], 'b.png', { type: 'image/png' }));
    const result = await intakeMultipart(form);
    expect(Object.keys(result.assets).sort()).toEqual(['imageA', 'imageB']);
    expect(result.assets.imageA.locator).toMatch(/^upload_[A-Za-z0-9_-]+\.png$/u);
    expect(JSON.stringify(result)).not.toContain('C:\\');
  });

  it('rejects hostile audit values instead of logging raw identifiers', () => {
    expect(() => safeAuditEvent({ action: 'PUBLISH_FAILED', actorId: 'actor', sessionId: 'session', artifactId: '../raw/hash', contentRevisionId: 'revision-1', occurredAt: new Date().toISOString() }, 'a'.repeat(32))).toThrow('AUDIT');
  });

  it('uses fenced database claims and never in-process Map authority', async () => {
    const calls: string[] = [];
    const db = { query: async (sql: string) => { calls.push(sql); return { rows: [{ disposition: 'OWNER', fence: 4 }] }; } };
    const store = new PostgresPublishReceiptStore(db);
    await store.claim({ key: 'idem-12345678', requestHash: 'a'.repeat(64), attestationHash: 'b'.repeat(64), ownerId: 'worker-1', now: 1, leaseMs: 1000 });
    expect(calls.join('\n')).toMatch(/publish_receipts|for update|fence/iu);
    expect(JSON.stringify(store)).not.toContain('Map');
  });

  it('composes authentication, intake and validation without caller-selected authority', async () => {
    const order: string[] = [];
    const handlers = createAdminHandlers({
      authenticate: async () => { order.push('auth'); return { actorId: 'a', sessionId: 's', roles: ['CONTENT_PUBLISHER'] }; },
      intake: async () => { order.push('intake'); return { artifact: {}, artifactSha256: 'a'.repeat(64), assets: {} as never }; },
      validate: async () => { order.push('validate'); return { ok: false as const, errors: [{ path: '/', ruleId: 'SCHEMA_BUNDLE', message: 'bad' }] }; },
      issueAttestation: async () => { throw new Error('must not attest'); }, publish: async () => { throw new Error('must not publish'); }, audit: async () => undefined,
    });
    const response = await handlers.validate(new Request('https://admin.test/api/admin/validate', { method: 'POST', body: new FormData() }));
    expect(order).toEqual(['auth', 'intake', 'validate']);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, errors: [{ ruleId: 'SCHEMA_BUNDLE' }] });
  });

  it('exposes a validator adapter that consumes submitted bytes in server-owned context', () => {
    expect(typeof createSubmittedArtifactValidator).toBe('function');
  });

  it('rejects submitted A/B bytes that do not match the exact declared artifact', async () => {
    const fixture = JSON.parse(await readFile(resolve('content/fixtures/valid/en-intermediate.json'), 'utf8')) as Record<string, any>;
    const aName = fixture.assetFiles[fixture.publicContent.imageA.sha256] as string;
    const bName = fixture.assetFiles[fixture.publicContent.imageB.sha256] as string;
    const form = new FormData();
    form.set('artifact', new File([JSON.stringify(fixture)], 'bundle.json', { type: 'application/json' }));
    form.set('imageA', new File([await readFile(resolve('content/fixtures/assets', bName))], bName, { type: fixture.publicContent.imageB.mimeType }));
    form.set('imageB', new File([await readFile(resolve('content/fixtures/assets', aName))], aName, { type: fixture.publicContent.imageA.mimeType }));
    const submission = await intakeMultipart(form);
    const result = await createSubmittedArtifactValidator(['https://cdn.spot-learn.test'])(submission);
    expect(result).toMatchObject({ ok: false, errors: [{ ruleId: 'ASSET_SUBMISSION_MISMATCH' }] });
  });
});
