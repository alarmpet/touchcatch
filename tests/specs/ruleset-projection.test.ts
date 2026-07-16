import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { checkRulesetProjection } from '../../tools/write-ruleset-projections.js';

describe('generated ruleset DB projection', () => {
  it('is byte-current and semantically consumed by the publishing migration', async () => {
    await expect(checkRulesetProjection()).resolves.toBeUndefined();
    const generated = await readFile(new URL('../../supabase/ruleset-content.generated.sql', import.meta.url), 'utf8');
    await expect(checkRulesetProjection(`${generated}\n-- drift`)).rejects.toThrow('RULESET_PROJECTION_BYTE_DRIFT');
    await expect(checkRulesetProjection(generated, '-- missing publishing predicates')).rejects.toThrow('RULESET_PROJECTION_SQL_DRIFT');
  });
});
