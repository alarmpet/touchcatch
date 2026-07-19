import fs from'node:fs';import{expect,it}from'vitest';import{evaluateSocketSnapshotRequirement,executeRequirementOracle}from'../../tools/requirement-oracle.js';
const root=process.cwd();
it('API-015 projects and validates an ordered private-safe snapshot',()=>expect(evaluateSocketSnapshotRequirement('API-015')).toBe(true));
it('rejects an unmapped snapshot requirement',()=>expect(()=>evaluateSocketSnapshotRequirement('API-999')).toThrow(/unsupported/));
it('dispatches API-015 wire evidence',()=>{const registry=JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`,'utf8')).requirements,evidence=JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`,'utf8')).entries;expect(executeRequirementOracle(root,registry.find((x:{id:string})=>x.id==='API-015'),evidence.find((x:{id:string})=>x.id==='API-015')).status).toBe('PASS');});
