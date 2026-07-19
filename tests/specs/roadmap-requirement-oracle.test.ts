import fs from'node:fs';import{expect,it}from'vitest';import{evaluateRoadmapRequirement}from'../../tools/requirement-oracle.js';
const source=fs.readFileSync('12_IMPLEMENTATION_ROADMAP.md','utf8');
const mutations:Record<string,(value:string)=>string>={
 'ENV-019':value=>value.replace(/The former Step 0.8 sequence is retired/u,'The former Step 0-8 sequence is active'),
 'ENV-020':value=>value.replace(/one developer with AI coding assistance, 6.10 weeks/u,'one developer with AI coding assistance, 5-9 weeks'),
 'ENV-021':value=>value.replace(/two developers, 4.7 weeks/u,'two developers, 3-6 weeks'),
 'ENV-022':value=>value.replace(/G3A . G3B . G3C . G4 . G5 . G6/u,'G3A -> G3C -> G3B -> G4 -> G5 -> G6'),
 'ENV-023':value=>value.replace(/stable IDs must not be reused for the G3A.G6 gates/u,'stable IDs may be reused for the G3A-G6 gates'),
};
it.each(Object.entries(mutations))('%s has an ID-specific roadmap predicate',(id,mutate)=>{expect(evaluateRoadmapRequirement(id)).toBe(true);expect(()=>evaluateRoadmapRequirement(id,mutate(source))).toThrow(/roadmap predicate drift/);});
it('rejects retired RULE-022 as a live source marker',()=>{expect(fs.readFileSync('02_CORE_RULES_AND_BALANCE.md','utf8')).not.toContain('REQ: RULE-022');});
