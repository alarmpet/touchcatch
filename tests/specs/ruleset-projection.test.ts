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
    const competing = migration.replace(
      "  if not requested_public_content ?& array",
      "  if jsonb_array_length(requested_private_solution->'differences') <> 10 then null; end if;\n  if not requested_public_content ?& array",
    );
    await expect(checkRulesetProjection(undefined, competing)).rejects.toThrow('RULESET_PROJECTION_COMPETING_PREDICATE');
  });

  it('rejects Boolean adjacency tampering at either ownership boundary', async () => {
    const migration = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    await expect(checkRulesetProjection(undefined, migration.replace('  -- BEGIN GENERATED', '  and false\n  -- BEGIN GENERATED'))).rejects.toThrow('RULESET_PROJECTION_ADJACENCY');
    await expect(checkRulesetProjection(undefined, migration.replace('  -- END GENERATED RULESET CONTENT PREDICATES', '  -- END GENERATED RULESET CONTENT PREDICATES\n  or true'))).rejects.toThrow('RULESET_PROJECTION_ADJACENCY');
  });
});
