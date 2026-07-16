import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CONTENT_CARDINALITY_V1, privateGameSolutionSchema } from '../../packages/contracts/src/content.js';
import ruleset from '../../config/ruleset.v1.json' with { type: 'json' };

describe('ruleset content projection parity', () => {
  it('derives contract cardinalities from RulesetV1', () => {
    expect(CONTENT_CARDINALITY_V1).toEqual(ruleset.content);
    expect(privateGameSolutionSchema.properties.differences).toMatchObject({ minItems: 10, maxItems: 10 });
    expect(privateGameSolutionSchema.properties.wordHunts).toMatchObject({ minItems: 3, maxItems: 3 });
  });

  it('checks the generated DB projection against RulesetV1', async () => {
    const sql = await readFile(new URL('../../supabase/ruleset-content.generated.sql', import.meta.url), 'utf8');
    expect(sql).toContain(`normal_differences integer := ${ruleset.content.normalDifferences}`);
    expect(sql).toContain(`hard_differences integer := ${ruleset.content.hardDifferences}`);
    expect(sql).toContain(`word_hunts integer := ${ruleset.content.wordHunts}`);
    const migration = await readFile(new URL('../../supabase/migrations/202607150002_content_security.sql', import.meta.url), 'utf8');
    expect(migration).toContain(`count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='NORMAL') <> ${ruleset.content.normalDifferences}`);
    expect(migration).toContain(`jsonb_array_length(requested_private_solution->'wordHunts') <> ${ruleset.content.wordHunts}`);
  });
});
