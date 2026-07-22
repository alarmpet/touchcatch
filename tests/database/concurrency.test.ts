import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateFixtureFile } from '../../packages/content-validator/src/validate-content.js';
import { parseContentAssetOrigins } from '../../packages/contracts/src/integration-evidence.js';
import { canonicalJson, canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import { loadLocalDatabaseUrl } from '../support/local-supabase-status.js';

function localDatabaseUrl(): string {
  const url = loadLocalDatabaseUrl();
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
  await admin.query(`grant deployment_role, admin_publish_role to ${publisherRole}`);
  const publisherUrl = new URL(databaseUrl);
  publisherUrl.username = publisherRole;
  publisherUrl.password = publisherPassword;
  publisherPool = new Pool({ connectionString: publisherUrl.toString(), max: 25 });
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
  beforeAll(()=>{publisherPool.on('acquire',(client:PoolClient)=>{const query=client.query.bind(client);client.query=((config:unknown,...values:unknown[])=>query(config==='set role deployment_role'?'set role admin_publish_role':config as never,...values as never[])) as typeof client.query;});});
  const claimSql='select private.claim_admin_publish_v1($1,$2,$3,$4,$5)::jsonb as claim';
  const completeSql='select private.complete_admin_publish_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)::text as id';
  it('persists PENDING across restart, reclaims expiry and fences stale completion',async()=>{
    const a=await publisherPool.connect(),b=await publisherPool.connect();const key=`idem_${randomUUID().replaceAll('-','')}`,requestHash=randomUUID().replaceAll('-','').repeat(2),attestationHash=randomUUID().replaceAll('-','').repeat(2),ownerA=`worker_${randomUUID().replaceAll('-','')}`,ownerB=`worker_${randomUUID().replaceAll('-','')}`;
    try{await a.query('set role deployment_role');await b.query('set role deployment_role');const first=(await a.query<{claim:{disposition:string;fence:number}}>(claimSql,[key,requestHash,attestationHash,ownerA,1])).rows[0]!.claim;expect(first.disposition).toBe('OWNER');expect((await b.query<{claim:{disposition:string}}>(claimSql,[key,requestHash,attestationHash,ownerB,1])).rows[0]!.claim.disposition).toBe('IN_FLIGHT');await expect(b.query<{claim:{disposition:string}}>(claimSql,[`other_${key}`,requestHash,attestationHash,ownerB,1])).resolves.toMatchObject({rows:[{claim:{disposition:'CONFLICT'}}]});await b.query('select pg_catalog.pg_sleep(1.1)');const reclaimed=(await b.query<{claim:{disposition:string;fence:number}}>(claimSql,[key,requestHash,attestationHash,ownerB,30])).rows[0]!.claim;expect(reclaimed).toMatchObject({disposition:'OWNER',fence:first.fence+1});const values=[key,requestHash,ownerA,first.fence,adminPublishFixture.publicContent,adminPublishFixture.privateSolution,adminPublishFixture.rightsManifest,adminPublishFixture.publicContentCanonicalJson,adminPublishFixture.privateSolutionCanonicalJson,adminPublishFixture.rightsManifestCanonicalJson,'a'.repeat(43),'b'.repeat(43),`artifact:${'c'.repeat(32)}`];await expect(a.query(completeSql,values)).rejects.toThrow('PUBLISH_FENCE_LOST');}finally{await a.query('reset role').catch(()=>undefined);await b.query('reset role').catch(()=>undefined);a.release();b.release();}
  });
  it('collapses twenty real sessions to one owner and one exact publish effect',async()=>{
    const key=`idem_${randomUUID().replaceAll('-','')}`,requestHash=randomUUID().replaceAll('-','').repeat(2),attestationHash=randomUUID().replaceAll('-','').repeat(2);const clients=await Promise.all(Array.from({length:20},()=>publisherPool.connect()));const before=await admin.query<{count:string}>('select count(*) from public.game_content_revisions');
    const revisionId=randomUUID(),contentId=randomUUID();const publicContent={...adminPublishFixture.publicContent,contentRevisionId:revisionId,contentId};const privateBase={...adminPublishFixture.privateSolution,contentRevisionId:revisionId} as Record<string,unknown>;delete privateBase.privateSolutionHash;const privateCanonical=canonicalJson(privateBase);const privateSolution={...privateBase,privateSolutionHash:canonicalJsonSha256(privateBase)};
    try{await Promise.all(clients.map(c=>c.query('set role deployment_role')));const claims=await Promise.all(clients.map((c,i)=>c.query<{claim:{disposition:string;fence:number}}>(claimSql,[key,requestHash,attestationHash,`worker_${i}_${randomUUID().replaceAll('-','')}`,30])));const ownerIndex=claims.findIndex(x=>x.rows[0]!.claim.disposition==='OWNER');expect(claims.filter(x=>x.rows[0]!.claim.disposition==='OWNER')).toHaveLength(1);const row=await admin.query<{owner_id:string,fence:string}>('select owner_id,fence::text from private.admin_publish_receipts where idempotency_key=$1',[key]);const receipt=row.rows[0]!;const values=[key,requestHash,receipt.owner_id,Number(receipt.fence),publicContent,privateSolution,adminPublishFixture.rightsManifest,canonicalJson(publicContent),privateCanonical,adminPublishFixture.rightsManifestCanonicalJson,'d'.repeat(43),'e'.repeat(43),`artifact:${randomUUID().replaceAll('-','')}`];const completed=await clients[ownerIndex]!.query<{id:string}>(completeSql,values);const after=await admin.query<{count:string}>('select count(*) from public.game_content_revisions');expect(Number(after.rows[0]!.count)-Number(before.rows[0]!.count)).toBe(1);expect(completed.rows[0]!.id).toBe(revisionId);const replays=await Promise.all(clients.map((c,i)=>c.query<{claim:{disposition:string;result:{contentRevisionId:string}}}>(claimSql,[key,requestHash,attestationHash,`replay_${i}_${randomUUID().replaceAll('-','')}`,30])));expect(replays.every(x=>x.rows[0]!.claim.disposition==='REPLAY'&&x.rows[0]!.claim.result.contentRevisionId===completed.rows[0]!.id)).toBe(true);expect((await admin.query<{count:string}>('select count(*) from private.admin_publish_audit where artifact_id=$1 and action=$2',[values[12],'PUBLISH_SUCCEEDED'])).rows[0]!.count).toBe('1');}finally{await Promise.all(clients.map(async c=>{await c.query('reset role').catch(()=>undefined);c.release();}));}
  });
  it('rolls back a proven deployment-role rejection before writing one safe failure audit',async()=>{
    const client=await publisherPool.connect(),key=`idem_${randomUUID().replaceAll('-','')}`,requestHash=randomUUID().replaceAll('-','').repeat(2),attestationHash=randomUUID().replaceAll('-','').repeat(2),owner=`worker_${randomUUID().replaceAll('-','')}`,artifactRef=`artifact:${randomUUID().replaceAll('-','')}`;const before=await admin.query<{count:string}>('select count(*) from public.game_content_revisions');
    try{await client.query('set role deployment_role');const claim=(await client.query<{claim:{fence:number}}>(claimSql,[key,requestHash,attestationHash,owner,30])).rows[0]!.claim;const invalid=[key,requestHash,owner,claim.fence,{},adminPublishFixture.privateSolution,adminPublishFixture.rightsManifest,'{}',adminPublishFixture.privateSolutionCanonicalJson,adminPublishFixture.rightsManifestCanonicalJson,'h'.repeat(43),'i'.repeat(43),artifactRef];await expect(client.query(completeSql,invalid)).rejects.toThrow();expect((await admin.query<{count:string}>('select count(*) from public.game_content_revisions')).rows[0]!.count).toBe(before.rows[0]!.count);expect((await admin.query<{state:string}>('select state from private.admin_publish_receipts where idempotency_key=$1',[key])).rows[0]!.state).toBe('PENDING');await client.query('select private.write_admin_publish_audit_v1($1,$2,$3,$4,$5,$6)',['PUBLISH_FAILED','h'.repeat(43),'i'.repeat(43),artifactRef,'revision:unknown','ZERO_EFFECT']);expect((await admin.query<{count:string}>('select count(*) from private.admin_publish_audit where artifact_id=$1 and action=$2 and outcome=$3',[artifactRef,'PUBLISH_FAILED','ZERO_EFFECT'])).rows[0]!.count).toBe('1');}finally{await client.query('reset role').catch(()=>undefined);client.release();}
  });
});
