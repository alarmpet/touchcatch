import { describe, expect, it } from 'vitest';
import { evaluatePureGameRequirement } from '../../tools/requirement-oracle.js';

describe('direct pure game requirement predicates',()=>{
  it.each(['STATE-001','STATE-009','OBS-012','OBS-013'])('%s invokes reducer/replay boundaries',id=>expect(evaluatePureGameRequirement(id)).toBe(true));
  it('fails closed for an unmapped mutation',()=>expect(()=>evaluatePureGameRequirement('STATE-001-MUTATED')).toThrow(/unsupported/));
});
