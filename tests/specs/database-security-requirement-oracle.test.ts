import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {evaluateDatabaseRequirement,executeRequirementOracle,expectConcurrencyEvidence,expectRoleMembershipLifecycle} from '../../tools/requirement-oracle.js';

const root=process.cwd();
const sql=fs.readdirSync(`${root}/supabase/migrations`).filter(x=>x.endsWith('.sql')).sort().map(x=>fs.readFileSync(`${root}/supabase/migrations/${x}`,'utf8')).join('\n');
const source={sql,config:fs.readFileSync(`${root}/supabase/config.toml`,'utf8'),roles:fs.readFileSync(`${root}/supabase/roles.sql`,'utf8')};

describe('database security requirement oracle',()=>{
  it('DATA-012 parses exact role-membership lifecycle evidence',()=>expect(()=>evaluateDatabaseRequirement('DATA-012')).not.toThrow());
  it('DATA-027 parses exact real-session concurrency evidence',()=>expect(()=>evaluateDatabaseRequirement('DATA-027')).not.toThrow());
  it('rejects DATA-012 duplicate or incomplete role membership lifecycles',()=>{const options={role:'game_security_owner',member:'postgres',grantCount:1,revokeCount:1};expect(()=>expectRoleMembershipLifecycle('GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres;',options)).not.toThrow();expect(()=>expectRoleMembershipLifecycle('GRANT game_security_owner TO postgres; GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres;',options)).toThrow(/lifecycle/);expect(()=>expectRoleMembershipLifecycle('GRANT game_security_owner TO postgres;',options)).toThrow(/lifecycle/);});
  it('rejects DATA-027 session, seat, role, or loopback semantic mutations',()=>{
    const testSource=fs.readFileSync(`${root}/tests/database/concurrency.test.ts`,'utf8'),options={sessions:20,expectedSeats:2,requiredRole:'app_server',loopbackOnly:true};
    expect(()=>expectConcurrencyEvidence(testSource,options)).not.toThrow();
    const mutations=[
      testSource.replace('const clients = await Promise.all(Array.from({ length: 20 }','const clients = await Promise.all(Array.from({ length: 19 }'),
      testSource.replace("'set role app_server'","'set role authenticated'"),
      testSource.replace('toHaveLength(2)','toHaveLength(3)'),
      testSource.replace("'../support/local-supabase-status.js'","'../support/remote-status.js'"),
    ];
    for(const mutated of mutations)expect(()=>expectConcurrencyEvidence(mutated,options)).toThrow(/concurrency/);
  });
  it.each(Array.from({length:13},(_,i)=>`DATA-${String(i+1).padStart(3,'0')}`))('%s has an exact repository predicate',id=>expect(evaluateDatabaseRequirement(id,source)).toBe(true));
  it.each([
    ['DATA-001','schemas = ["public", "graphql_public"]','schemas = ["public", "private"]'],
    ['DATA-007','with (security_invoker = true)','with (security_invoker = false)'],
    ['DATA-009','create role game_security_owner nologin noinherit','create role game_security_owner login inherit'],
    ['DATA-010','revoke execute on function private.publish_economy_bundle_v1(jsonb,jsonb) from deployment_role','select 1'],
    ['DATA-011','private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) from app_server','private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) from authenticated'],
    ['DATA-013','set search_path = pg_catalog','set search_path = public'],
  ])('%s rejects a security weakening mutation',(id,needle,replacement)=>expect(()=>evaluateDatabaseRequirement(id,{...source,sql:source.sql.replaceAll(needle,replacement),config:source.config.replaceAll(needle,replacement),roles:source.roles.replaceAll(needle,replacement)})).toThrow());
  it('dispatches DATA-001 through DB_PROJECTION',()=>{const registry=JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`,'utf8')),evidence=JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`,'utf8'));const row=registry.requirements.find((x:{id:string})=>x.id==='DATA-001'),claim=evidence.entries.find((x:{id:string})=>x.id==='DATA-001');expect(executeRequirementOracle(root,row,claim).status).toBe('PASS');});
  it.each(Array.from({length:8},(_,i)=>`DATA-${String(i+14).padStart(3,'0')}`))('%s maps an exact match persistence predicate',id=>expect(evaluateDatabaseRequirement(id,source)).toBe(true));
  it.each(Array.from({length:5},(_,i)=>`DATA-${String(i+23).padStart(3,'0')}`))('%s maps exact ACL or concurrency evidence',id=>expect(evaluateDatabaseRequirement(id,source)).toBe(true));
  it.each(['DATA-028','DATA-029'])('%s maps current domain or economy persistence evidence',id=>expect(evaluateDatabaseRequirement(id,source)).toBe(true));
  it.each([['DATA-014',"'SUDDEN_DEATH'","'SUDDEN_DRIFT'"],['DATA-017','check (seat_no in (1,2))','check (seat_no in (1,2,3))'],['DATA-018','deferrable initially deferred','not deferrable'],['DATA-020','primary key(match_id, objective_id)','primary key(match_id, participant_key)'],['DATA-021',"old.status = 'COMPLETED'","old.status = 'PENDING'"]])('%s rejects invariant mutation',(id,a,b)=>expect(()=>evaluateDatabaseRequirement(id,{...source,sql:source.sql.replace(a,b)})).toThrow());
});
