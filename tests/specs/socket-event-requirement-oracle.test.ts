import fs from'node:fs';import{expect,it}from'vitest';import{evaluateSocketEventRequirement,evaluateSocketFinishedRequirement,executeRequirementOracle}from'../../tools/requirement-oracle.js';
const root=process.cwd(),ids=Array.from({length:9},(_,i)=>`API-${String(i+16).padStart(3,'0')}`);
it.each(ids.slice(0,-1))('%s validates its reducer-produced projected event',id=>expect(evaluateSocketEventRequirement(id)).toBe(true));
it('API-024 validates its reducer-produced terminal event',()=>expect(evaluateSocketFinishedRequirement('API-024')).toBe(true));
it('rejects an unmapped server event',()=>expect(()=>evaluateSocketEventRequirement('API-999')).toThrow(/unsupported/));
it.each(ids)('%s dispatches wire evidence',id=>{const r=JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`,'utf8')).requirements,e=JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`,'utf8')).entries;expect(executeRequirementOracle(root,r.find((x:{id:string})=>x.id===id),e.find((x:{id:string})=>x.id===id)).status).toBe('PASS');});
