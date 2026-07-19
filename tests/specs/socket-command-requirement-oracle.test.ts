import fs from'node:fs';import{expect,it}from'vitest';import{evaluateSocketCommandRequirement,executeRequirementOracle}from'../../tools/requirement-oracle.js';
const root=process.cwd(),ids=['API-010','API-011','API-012','API-013','API-014'];
it.each(ids)('%s parses its concrete strict command fixture',id=>expect(evaluateSocketCommandRequirement(id)).toBe(true));
it('rejects unmapped socket commands',()=>expect(()=>evaluateSocketCommandRequirement('API-999')).toThrow(/unsupported/));
it.each(ids)('%s dispatches through declared wire evidence',id=>{const registry=JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`,'utf8')).requirements,evidence=JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`,'utf8')).entries;expect(executeRequirementOracle(root,registry.find((x:{id:string})=>x.id===id),evidence.find((x:{id:string})=>x.id===id)).status).toBe('PASS');});
