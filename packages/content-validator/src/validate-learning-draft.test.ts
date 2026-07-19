import fs from'node:fs';import{describe,expect,it}from'vitest';import{validateLearningCatalogue,validateLearningDraft}from'./validate-learning-draft.js';
const cataloguePath='content/learning/catalog.v1.json';
const exactKeys=['en-resilience','en-dilemma','en-sustainability','ko-proverb-dark-under-lamp','ko-proverb-seeing-is-believing','ko-proverb-kind-words-return','ko-idiom-turn-misfortune','ko-idiom-prepare-ahead','ko-idiom-perspective'];
describe('learning DRAFT boundary',()=>{
 it('enumerates the exact nine approved design keys',()=>{const catalog=JSON.parse(fs.readFileSync(cataloguePath,'utf8'));expect(validateLearningCatalogue(catalog)).toEqual({ok:true});expect(catalog.entries.map((x:{key:string})=>x.key)).toEqual(exactKeys);expect(catalog.entries.every((x:{difficulty:string;status:string})=>x.difficulty==='ADVANCED'&&x.status==='DRAFT')).toBe(true);});
 it('requires generated assets before draft validation',async()=>{const result=await validateLearningDraft('en-resilience');expect(result).toEqual({structuralOk:false,publishBlocked:true,blocker:'ASSETS_NOT_GENERATED'});});
 it('rejects catalogue drift and cannot express approval',()=>{const catalog=JSON.parse(fs.readFileSync(cataloguePath,'utf8'));expect(validateLearningCatalogue({...catalog,entries:catalog.entries.slice(0,8)})).toMatchObject({ok:false});expect(validateLearningCatalogue({...catalog,entries:catalog.entries.map((x:{key:string})=>x.key==='en-resilience'?{...x,status:'APPROVED'}:x)})).toMatchObject({ok:false});});
});
