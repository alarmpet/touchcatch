import{expect,it}from'vitest';import{evaluateAnalyticsRequirement,evaluatePureGameRequirement}from'../../tools/requirement-oracle.js';
it('executes exact analytics privacy, trace, retry, and local load predicates',()=>{for(const id of ['OBS-006','OBS-007','OBS-014','OBS-015'])expect(evaluateAnalyticsRequirement(id)).toBe(true);expect(()=>evaluateAnalyticsRequirement('OBS-999')).toThrow(/unsupported/);});
it('executes exact no-contest and recovery predicates',()=>{for(const id of ['OBS-011','OBS-012','OBS-013'])expect(evaluatePureGameRequirement(id)).toBe(true);});
