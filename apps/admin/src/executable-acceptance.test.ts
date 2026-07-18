import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bootstrapBrowserSession, type BrowserAuthShell } from './client/session-bootstrap.js';
import { createAdminHandlers } from './server/handlers.js';

describe('admin executable acceptance', () => {
  it('bootstraps a browser session through the auth shell without persisting the access token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const auth: BrowserAuthShell = { acquireAccessToken: async () => 'ephemeral-token' };
    const state = await bootstrapBrowserSession(auth, async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, csrfToken: 'csrf-state' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    expect(state).toEqual({ status: 'ready', csrfToken: 'csrf-state' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { authorization: 'Bearer ephemeral-token' } });
    expect(JSON.stringify(state)).not.toContain('ephemeral-token');
  });

  it('uses definer-only audit writers, opaque keyed artifact refs, and no direct production inserts', async () => {
    const migration = await readFile('supabase/migrations/202607190001_admin_publish_receipts.sql', 'utf8');
    const runtime = await readFile('apps/admin/src/server/runtime.ts', 'utf8');
    expect(migration).toContain('write_admin_publish_audit_v1');
    expect(migration).toMatch(/security definer set search_path = pg_catalog/gu);
    expect(migration).toMatch(/revoke all on private\.admin_publish_audit/gu);
    expect(runtime).toContain('private.write_admin_publish_audit_v1');
    expect(runtime).not.toMatch(/insert into private\.admin_publish_audit/iu);
    expect(migration).not.toContain("'artifact:'||p_request_hash");
  });

  it('keeps legacy workflow stores outside the production server graph', async () => {
    await expect(readFile('apps/admin/src/server/publish-workflow.ts', 'utf8')).rejects.toThrow();
    await expect(readFile('apps/admin/src/server/deployment-publisher.ts', 'utf8')).rejects.toThrow();
    await expect(readFile('apps/admin/src/server/receipt-store.ts', 'utf8')).rejects.toThrow();
  });

  it('preserves the publish failure when the post-rollback failure audit is unavailable', async () => {
    const handlers = createAdminHandlers({
      authenticate: async () => ({ actorId: 'actor', sessionId: 'session', roles: ['CONTENT_PUBLISHER'] }),
      intake: async () => ({ artifact: {}, artifactSha256: 'a'.repeat(64), assets: {} as never }),
      validate: async () => ({ ok: false, errors: [] }), issueAttestation: async () => '',
      publish: async () => { throw new Error('DEPLOYMENT_ROLLED_BACK'); },
      audit: async () => { throw new Error('AUDIT_UNAVAILABLE'); },
    });
    const response = await handlers.publish(new Request('https://admin.test/api/admin/publish', { method: 'POST', body: new FormData() }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'DEPLOYMENT_ROLLED_BACK' } });
  });
});
