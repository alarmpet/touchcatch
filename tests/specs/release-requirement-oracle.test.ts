import{expect,it}from'vitest';
import{evaluateReleaseRequirement}from'../../tools/requirement-oracle.js';

it.each(Array.from({length:15},(_,i)=>`QA-${String(i+1).padStart(3,'0')}`))('%s executes an exact release predicate',id=>expect(evaluateReleaseRequirement(id)).toBe(true));
it('rejects an unsupported QA requirement',()=>expect(()=>evaluateReleaseRequirement('QA-999')).toThrow(/unsupported/));
