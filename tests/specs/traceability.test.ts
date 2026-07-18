import { describe, expect, it } from 'vitest';
import { checkNormativeNumbers, checkTraceability } from '../../tools/check-docs-lib.js';

describe('normative traceability', () => {
  it('rejects missing, duplicate and broken mappings', () => {
    const result=checkTraceability({normativeIds:['OBS-01','QA-01'],rows:[{id:'OBS-01',source:'README.md',schema:'missing.ts',phase:'G',test:'missing.test.ts',metric:'m'},{id:'OBS-01',source:'README.md',schema:'missing.ts',phase:'G',test:'missing.test.ts',metric:'m'}],existingPaths:new Set(['README.md'])});
    expect(result.missing).toEqual(['QA-01']); expect(result.duplicates).toEqual(['OBS-01']); expect(result.broken.length).toBeGreaterThan(0);
  });
  it('detects frozen load and simulation numeric drift',()=>{
    expect(checkNormativeNumbers({'docs/testing/load-slo.md':'100 matches 200 sockets','docs/testing/simulation-model.md':'50 matches'}).length).toBeGreaterThan(0);
  });
});
