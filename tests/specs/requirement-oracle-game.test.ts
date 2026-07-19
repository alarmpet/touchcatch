import { describe, expect, it } from 'vitest';
import { evaluatePureGameRequirement } from '../../tools/requirement-oracle.js';

describe('direct pure game requirement predicates',()=>{
  it.each(['STATE-001','STATE-002','STATE-003','STATE-004','STATE-005','STATE-006','STATE-007','STATE-008','STATE-009','STATE-010','OBS-012','OBS-013'])('%s invokes its direct state/runtime boundary',id=>expect(evaluatePureGameRequirement(id)).toBe(true));
  it('fails closed for an unmapped mutation',()=>expect(()=>evaluatePureGameRequirement('STATE-001-MUTATED')).toThrow(/unsupported/));
});
