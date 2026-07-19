import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function localDbUrl(): URL {
  const output = execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'], { encoding: 'utf8', windowsHide: true });
  const raw = /^DB_URL=(?:"([^"]+)"|([^\r\n]+))$/mu.exec(output)?.slice(1).find(Boolean);
  if (!raw) throw new Error('local DB_URL required');
  const url = new URL(raw); if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('loopback database required'); return url;
}
const rootUrl = localDbUrl(); const admin = new Pool({ connectionString: rootUrl.toString() }); const userId = randomUUID(); let api: Pool;
async function transaction(client: PoolClient, sql: string, values: readonly unknown[]) { await client.query('begin'); await client.query('set local role app_server'); try { const result = await client.query(sql, values); await client.query('commit'); return result; } catch (error) { await client.query('rollback'); throw error; } }

beforeAll(async () => { await admin.query("insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)",[userId,`${userId}@example.test`]); const url=new URL(rootUrl);url.username='touchcatch_api_test';url.password='touchcatch_local_test_only';api=new Pool({connectionString:url.toString(),max:4}); const client=await api.connect();try{await transaction(client,'select private.ensure_account_v1($1)',[userId]);}finally{client.release();} });
afterAll(async()=>{await api?.end();await admin.query('delete from auth.users where id=$1',[userId]).catch(()=>undefined);await admin.query('revoke account_security_owner from postgres').catch(()=>undefined);await admin.end();});

describe('account lifecycle serialization',()=>{
  it('replays the same nickname key under concurrency',async()=>{const key=randomUUID();const clients=await Promise.all([api.connect(),api.connect()]);try{const results=await Promise.all(clients.map(client=>transaction(client,'select private.update_profile_v1($1,$2,$3) value',[userId,key,'Concurrent Name'])));expect(new Set(results.map(result=>JSON.stringify(result.rows[0]?.value))).size).toBe(1);expect((await admin.query('select count(*)::int n from private.profile_update_decisions where idempotency_key=$1',[key])).rows[0]?.n).toBe(1);}finally{clients.forEach(client=>client.release());}});
  it('allows only one distinct nickname key inside the rate window',async()=>{await admin.query('grant account_security_owner to postgres');await admin.query("update private.profile_update_decisions set decided_at=clock_timestamp()-interval '2 minutes' where subject_key=(select subject_key from private.api_subjects where user_id=$1)",[userId]);const clients=await Promise.all([api.connect(),api.connect()]);try{const settled=await Promise.allSettled(clients.map((client,index)=>transaction(client,'select private.update_profile_v1($1,$2,$3)',[userId,randomUUID(),`Name ${index}`])));expect(settled.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(settled.filter(result=>result.status==='rejected'&&/RATE_LIMITED/u.test(String(result.reason)))).toHaveLength(1);}finally{clients.forEach(client=>client.release());}});
  it('leases one approved deletion job to exactly one worker',async()=>{const requester=await api.connect();let jobId:string;try{const result=await transaction(requester,'select private.request_account_deletion_v1($1,$2) value',[userId,randomUUID()]);jobId=(result.rows[0]?.value as {jobId:string}).jobId;}finally{requester.release();}const policy=await admin.connect();try{await policy.query('begin');await policy.query('set local role account_deletion_policy_role');await policy.query('select private.approve_account_deletion_policy_v1($1,$2)',[jobId,'HARD']);await policy.query('commit');}finally{policy.release();}const workers=await Promise.all(Array.from({length:10},()=>admin.connect()));try{const claims=await Promise.all(workers.map(async(client)=>{await client.query('begin');await client.query('set local role account_worker');const value=(await client.query('select private.claim_account_deletion_job_v1($1,$2) value',[randomUUID(),30000])).rows[0]?.value as {jobId?:string}|null;await client.query('commit');return value;}));expect(claims.filter(claim=>claim?.jobId===jobId)).toHaveLength(1);}finally{workers.forEach(client=>client.release());}});
});
