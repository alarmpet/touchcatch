import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateFixtureFile } from '../../packages/content-validator/src/validate-content.js';
import { parseContentAssetOrigins } from '../../packages/contracts/src/integration-evidence.js';

function localDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const output = explicit ?? execFileSync(
    process.execPath,
    [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'],
    { encoding: 'utf8', windowsHide: true },
  );
  const match = explicit ? explicit : /^DB_URL=(?:"([^"]+)"|([^\r\n]+))$/mu.exec(output)?.slice(1).find(Boolean);
  if (!match) throw new Error('TEST_DATABASE_URL or local Supabase DB_URL is required');
  const url = new URL(match);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('database concurrency tests only run against loopback');
  if (url.pathname !== '/postgres') throw new Error('database concurrency tests require the local postgres database');
  return url.toString();
}

const databaseUrl = localDatabaseUrl();
const admin = new Pool({ connectionString: databaseUrl, max: 25 });
const publisherRole = `content_publisher_test_${process.pid}`;
const publisherPassword = randomUUID();
let publisherPool: Pool;
let adminPublishFixture: Extract<Awaited<ReturnType<typeof validateFixtureFile>>, { ok: true }>['value'];
const matchId = randomUUID();
const revisionId = '11111111-1111-4111-8111-111111111111';
const userIds = Array.from({ length: 20 }, () => randomUUID());
const participantKeys = Array.from({ length: 20 }, () => randomUUID());

async function asAppServer(client: PoolClient): Promise<void> {
  await client.query('set role app_server');
  const role = await client.query<{ current_user: string }>('select current_user');
  expect(role.rows[0]?.current_user).toBe('app_server');
}

beforeAll(async () => {
  const adminFixture = await validateFixtureFile(resolve('content/fixtures/valid/en-intermediate.json'));
  if (!adminFixture.ok) throw new Error('admin fixture rejected');
  adminPublishFixture = adminFixture.value;
  const validated = await validateFixtureFile(resolve('content/fixtures/valid/ko-beginner.json'));
  if (!validated.ok) throw new Error(`valid content fixture rejected: ${JSON.stringify(validated.errors)}`);
  await admin.query(
    `insert into auth.users(id,aud,role,email)
     select id::uuid,'authenticated','authenticated',email
     from unnest($1::text[],$2::text[]) as input(id,email)`,
    [userIds, userIds.map((id) => `${id}@example.test`)],
  );
  await admin.query(
    `insert into public.profiles(id,nickname)
     select id::uuid, 'race-' || row_number() over () from unnest($1::text[]) as input(id)`,
    [userIds],
  );
  await admin.query(`create role ${publisherRole} login noinherit password '${publisherPassword}'`);
  await admin.query(`grant deployment_role to ${publisherRole}`);
  const publisherUrl = new URL(databaseUrl);
  publisherUrl.username = publisherRole;
  publisherUrl.password = publisherPassword;
  publisherPool = new Pool({ connectionString: publisherUrl.toString(), max: 4 });
  const publisher = await publisherPool.connect();
  try {
    const identity = await publisher.query<{ session_user: string; current_user: string; app_server_member: boolean }>(
      `select session_user, current_user, pg_has_role(session_user, 'app_server', 'MEMBER') as app_server_member`,
    );
    expect(identity.rows[0]).toEqual({
      session_user: publisherRole,
      current_user: publisherRole,
      app_server_member: false,
    });
    await expect(publisher.query(
      'select private.publish_content_revision_v1($1,$2,$3,$4,$5,$6,$7)',
      [
        validated.value.publicContent,
        validated.value.privateSolution,
        validated.value.rightsManifest,
        validated.value.publicContentCanonicalJson,
        validated.value.privateSolutionCanonicalJson,
        validated.value.rightsManifestCanonicalJson,
        '1.0.0',
      ],
    )).rejects.toThrow();
    await publisher.query('set role deployment_role');
    await expect(publisher.query('select * from private.game_content_solutions')).rejects.toThrow();
    const privilege=await publisher.query<{allowed:boolean}>("select has_table_privilege(current_user,'public.game_content_revisions','INSERT') as allowed");
    expect(privilege.rows[0]?.allowed).toBe(false);
    const directRevision=randomUUID();
    await publisher.query(
      `insert into public.game_content_revisions(content_revision_id,content_id,version,schema_version,asset_policy_version,public_content,public_content_hash,status,approved_at,rights_manifest_set_id,validator_version)
       values ($1,$2,1,'1.0.0','1.0.0',$3::jsonb,$4,'PUBLISHED',now(),'direct-dml-test','1.0.0')`,
      [directRevision,randomUUID(),JSON.stringify({schemaVersion:'1.0.0'}),'f'.repeat(64)],
    ).then(
      ()=>{throw new Error('direct DML unexpectedly succeeded');},
      (error:unknown)=>{expect(error).toMatchObject({code:'42501'});},
    );
    await publisher.query(
      'select private.publish_content_revision_v1($1,$2,$3,$4,$5,$6,$7)',
      [
        validated.value.publicContent,
        validated.value.privateSolution,
        validated.value.rightsManifest,
        validated.value.publicContentCanonicalJson,
        validated.value.privateSolutionCanonicalJson,
        validated.value.rightsManifestCanonicalJson,
        '1.0.0',
      ],
    );
  } finally {
    await publisher.query('reset role').catch(() => undefined);
    publisher.release();
  }
  const reader = await admin.connect();
  try {
    await reader.query('set role anon');
    const stored = await reader.query<{ public_content_hash: string }>(
      'select public_content_hash from public.game_content_catalog where content_revision_id=$1',
      [revisionId],
    );
    expect(stored.rows[0]?.public_content_hash).toBe(validated.value.publicContentHash);
  } finally {
    await reader.query('reset role').catch(() => undefined);
    reader.release();
  }
  const configuredOrigins = parseContentAssetOrigins(process.env.CONTENT_ASSET_ORIGINS ?? 'https://cdn.spot-learn.test','1.0.0');
  const storedOrigins = await admin.query<{ assetPolicyVersion:string; origin: string }>('select asset_policy_version as "assetPolicyVersion", origin from private.content_asset_origins order by asset_policy_version, origin');
  expect(storedOrigins.rows).toEqual(configuredOrigins);
  await admin.query(
    `insert into public.matches(id,content_revision_id,status,server_version,ruleset_version,ruleset_hash,engine_version,protocol_version,experiment_variant)
     values ($1,$2,'WAITING_FOR_ASSETS','test','1.0.0',repeat('c',64),'1.0.0','1.0.0','CONTROL')`,
    [matchId, revisionId],
  );
});

afterAll(async () => {
  await admin.query('delete from public.matches where id=$1', [matchId]).catch(() => undefined);
  await admin.query('delete from auth.users where id=any($1::uuid[])', [userIds]).catch(() => undefined);
  await publisherPool?.end().catch(() => undefined);
  await admin.query(`drop role if exists ${publisherRole}`).catch(() => undefined);
  await admin.end();
});

describe('join_match_participant_v1 concurrency', () => {
  it('allows exactly two seats across 20 real app_server sessions', async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, () => admin.connect()));
    try {
      await Promise.all(clients.map(asAppServer));
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => { release = resolve; });
      const calls = clients.map(async (client, index) => {
        await barrier;
        const result = await client.query<{ joined: boolean }>(
          'select private.join_match_participant_v1($1,$2,$3) as joined',
          [matchId, participantKeys[index], userIds[index]],
        );
        return result.rows[0]?.joined;
      });
      release();
      const results = await Promise.all(calls);
      expect(results.filter(Boolean)).toHaveLength(2);
      const rows = await admin.query<{ seat_no: number }>('select seat_no from public.match_players where match_id=$1 order by seat_no', [matchId]);
      expect(rows.rows.map((row) => row.seat_no)).toEqual([1, 2]);
    } finally {
      await Promise.all(clients.map(async (client) => { await client.query('reset role').catch(() => undefined); client.release(); }));
    }
  });
});

describe('admin publish durable database boundary', () => {
  it('replays exact stored results and rejects key/hash and attestation reuse across real sessions', async () => {
    const client = await publisherPool.connect(); const restartedClient = await publisherPool.connect();
    const key = `idem_${randomUUID().replaceAll('-', '')}`; const requestHash = '1'.repeat(64); const attestationHash = '2'.repeat(64);
    const args = [key,requestHash,attestationHash,adminPublishFixture.publicContent,adminPublishFixture.privateSolution,adminPublishFixture.rightsManifest,adminPublishFixture.publicContentCanonicalJson,adminPublishFixture.privateSolutionCanonicalJson,adminPublishFixture.rightsManifestCanonicalJson,'a'.repeat(43),'b'.repeat(43),`worker_${randomUUID().replaceAll('-','')}`];
    try {
      await client.query('set role deployment_role');
      await restartedClient.query('set role deployment_role');
      const first = await client.query<{ id: string }>('select private.publish_attested_content_revision_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)::text as id', args);
      const replay = await restartedClient.query<{ id: string }>('select private.publish_attested_content_revision_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)::text as id', args);
      expect(replay.rows).toEqual(first.rows);
      await expect(client.query('select private.publish_attested_content_revision_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [key,'3'.repeat(64),...args.slice(2)])).rejects.toThrow('IDEMPOTENCY_CONFLICT');
      await expect(client.query('select private.publish_attested_content_revision_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [`other_${key}`,requestHash,...args.slice(2)])).rejects.toThrow();
    } finally { await client.query('reset role').catch(() => undefined); await restartedClient.query('reset role').catch(() => undefined); client.release(); restartedClient.release(); }
  });
});
