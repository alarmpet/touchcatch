import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { checkRulesetProjection } from '../../tools/write-ruleset-projections.js';

describe('generated ruleset DB projection', () => {
  it('is byte-current and semantically consumed by the publishing migration', async () => {
    await expect(checkRulesetProjection()).resolves.toBeUndefined();
    const migration = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    await expect(checkRulesetProjection(undefined, migration.replace('<> 10', '<> 99'))).rejects.toThrow('RULESET_PROJECTION_BYTE_DRIFT');
    await expect(checkRulesetProjection(undefined, '-- missing publishing predicates')).rejects.toThrow('RULESET_PROJECTION_MARKERS');
  });

  it('rejects expected text hidden in comments while active predicates are wrong', async () => {
    const migration = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    const expectedPredicates = migration.match(/jsonb_array_length\(requested_private_solution->'differences'\)[\s\S]*?item->>'kind'='SPECIAL'\) <> 1/)?.[0] ?? '';
    const wrongActive = migration.replace(expectedPredicates, expectedPredicates.replaceAll('<> 3', '<> 99').replaceAll('<> 10', '<> 99').replaceAll('<> 7', '<> 99').replaceAll('<> 2', '<> 99'));
    await expect(checkRulesetProjection(undefined, `${wrongActive}\n/* ${expectedPredicates} */`)).rejects.toThrow(/RULESET_PROJECTION/);
  });

  it('rejects duplicate markers and competing active predicates', async () => {
    const migration = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    await expect(checkRulesetProjection(undefined, `${migration}\n  -- BEGIN GENERATED RULESET CONTENT PREDICATES`)).rejects.toThrow('RULESET_PROJECTION_MARKERS');
    await expect(checkRulesetProjection(undefined, `${migration}\nif jsonb_array_length(requested_private_solution->'differences') <> 10 then null; end if;`)).rejects.toThrow('RULESET_PROJECTION_COMPETING_PREDICATE');
  });
});
