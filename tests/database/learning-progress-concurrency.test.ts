import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

function localDatabaseUrl(): URL {
  const output = execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'], { encoding: 'utf8', windowsHide: true });
  const raw = /^DB_URL=(?:"([^"]+)"|([^\r\n]+))$/mu.exec(output)?.slice(1).find(Boolean);
  if (!raw) throw new Error('local DB_URL required');
  const url = new URL(raw); if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('loopback database required'); return url;
}

const rootUrl = localDatabaseUrl();
const admin = new Pool({ connectionString: rootUrl.toString(), max: 22 });
const userId = randomUUID(), revisionId = randomUUID(), contentId = randomUUID(), eventId = randomUUID(), batchId = randomUUID();
let api: Pool;

beforeAll(async () => {
  await admin.query("insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)", [userId, `${userId}@example.test`]);
  await admin.query('grant game_security_owner to postgres');
  const client = await admin.connect();
  try { await client.query('begin'); await client.query('set local role game_security_owner'); await client.query("insert into public.game_content_revisions(content_revision_id,content_id,version,schema_version,asset_policy_version,public_content,public_content_hash,status,approved_at,rights_manifest_set_id,validator_version) values($1,$2,1,'1.0.0','1.0.0',$3,$4,'PUBLISHED',now(),$5,'1.0.0')", [revisionId, contentId, { theme: `progress-${contentId}` }, randomUUID().replaceAll('-', '').repeat(2), `rights-${contentId}`]); await client.query('commit'); } finally { client.release(); }
  const url = new URL(rootUrl); url.username = 'touchcatch_api_test'; url.password = 'touchcatch_local_test_only'; api = new Pool({ connectionString: url.toString(), max: 20 });
  const bootstrap = await api.connect(); try { await bootstrap.query('begin'); await bootstrap.query('set local role app_server'); await bootstrap.query('select private.ensure_account_v1($1)', [userId]); await bootstrap.query('commit'); } finally { bootstrap.release(); }
});

afterAll(async () => { await api?.end(); await admin.query('delete from auth.users where id=$1', [userId]).catch(() => undefined); await admin.query('revoke game_security_owner from postgres').catch(() => undefined); await admin.end(); });

it('collapses twenty concurrent batch claims to one exact response and event', async () => {
  const events = [{ deviceEventId: eventId, contentKey: `progress-${contentId}`, contentRevision: '1', completedAt: '2026-07-19T00:00:00Z' }];
  const clients = await Promise.all(Array.from({ length: 20 }, () => api.connect()));
  try {
    const responses = await Promise.all(clients.map(async (client) => { await client.query('begin'); await client.query('set local role app_server'); const value = (await client.query<{ value: unknown }>('select private.merge_learning_progress_v1($1,$2,$3,$4) value', [userId, batchId, 'a'.repeat(64), JSON.stringify(events)])).rows[0]?.value; await client.query('commit'); return value; }));
    expect(new Set(responses.map(JSON.stringify)).size).toBe(1);
    expect((await admin.query<{ n: number }>('select count(*)::int n from private.learning_progress_events where device_event_id=$1', [eventId])).rows[0]?.n).toBe(1);
    expect((await admin.query<{ n: number }>('select count(*)::int n from private.learning_progress_batches where idempotency_key=$1', [batchId])).rows[0]?.n).toBe(1);
  } finally { clients.forEach((client) => client.release()); }
});
