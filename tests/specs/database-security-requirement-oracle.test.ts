import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {evaluateDatabaseRequirement,executeRequirementOracle} from '../../tools/requirement-oracle.js';

const root=process.cwd();
const sql=fs.readdirSync(`${root}/supabase/migrations`).filter(x=>x.endsWith('.sql')).sort().map(x=>fs.readFileSync(`${root}/supabase/migrations/${x}`,'utf8')).join('\n');
const source={sql,config:fs.readFileSync(`${root}/supabase/config.toml`,'utf8'),roles:fs.readFileSync(`${root}/supabase/roles.sql`,'utf8')};

describe('database security requirement oracle',()=>{
  it.each([1,2,3,4,5,6,7,8,9,12,13].map(i=>`DATA-${String(i).padStart(3,'0')}`))('%s has an exact repository predicate',id=>expect(evaluateDatabaseRequirement(id,source)).toBe(true));
  it.each(['DATA-010','DATA-011'])('%s fails because the role now has additional executable functions',id=>expect(()=>evaluateDatabaseRequirement(id,source)).toThrow(/exact execute surface/));
  it.each([
    ['DATA-001','schemas = ["public", "graphql_public"]','schemas = ["public", "private"]'],
    ['DATA-007','with (security_invoker = true)','with (security_invoker = false)'],
    ['DATA-009','create role game_security_owner nologin noinherit','create role game_security_owner login inherit'],
    ['DATA-013','set search_path = pg_catalog','set search_path = public'],
  ])('%s rejects a security weakening mutation',(id,needle,replacement)=>expect(()=>evaluateDatabaseRequirement(id,{...source,sql:source.sql.replaceAll(needle,replacement),config:source.config.replaceAll(needle,replacement),roles:source.roles.replaceAll(needle,replacement)})).toThrow());
  it('dispatches DATA-001 through DB_PROJECTION',()=>{const registry=JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`,'utf8')),evidence=JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`,'utf8'));const row=registry.requirements.find((x:{id:string})=>x.id==='DATA-001'),claim=evidence.entries.find((x:{id:string})=>x.id==='DATA-001');expect(executeRequirementOracle(root,row,claim).status).toBe('PASS');});
});
