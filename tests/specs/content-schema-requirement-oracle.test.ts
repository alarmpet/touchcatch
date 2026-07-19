import fs from'node:fs';import{expect,it}from'vitest';import{evaluateContentSchemaRequirement,evaluateContentSemanticRequirement,executeRequirementOracle}from'../../tools/requirement-oracle.js';
const root=process.cwd(),ids=Array.from({length:9},(_,i)=>`CONTENT-${String(i+1).padStart(3,'0')}`);
it.each(ids)('%s validates its exact schema-first contract',id=>expect(evaluateContentSchemaRequirement(id)).toBe(true));
it('rejects unsupported content schema IDs',()=>expect(()=>evaluateContentSchemaRequirement('CONTENT-999')).toThrow(/unsupported/));
it.each(ids)('%s dispatches content evidence',id=>{const r=JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`,'utf8')).requirements,e=JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`,'utf8')).entries;expect(executeRequirementOracle(root,r.find((x:{id:string})=>x.id===id),e.find((x:{id:string})=>x.id===id)).status).toBe('PASS');});
it('CONTENT-010 directly verifies shared answer-limit parity',()=>expect(evaluateContentSemanticRequirement('CONTENT-010')).toBe(true));
it.each(Array.from({length:9},(_,i)=>`CONTENT-${String(i+19).padStart(3,'0')}`))('%s verifies its local lifecycle predicate',id=>expect(evaluateContentSemanticRequirement(id)).toBe(true));
