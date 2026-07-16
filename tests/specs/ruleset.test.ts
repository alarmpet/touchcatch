import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseRuleset, rulesetHash } from '../../packages/contracts/src/rules.schema.js';

const root = new URL('../../', import.meta.url);

describe('ruleset v1 SSOT', () => {
  it('loads the exact frozen ruleset and hashes validated values', async () => {
    const value = parseRuleset(JSON.parse(await readFile(new URL('config/ruleset.v1.json', root), 'utf8')));
    expect(value.rulesetVersion).toBe('1.0.0');
    expect(value.time).toMatchObject({ assetLoadMs: 20_000, countdownMs: 3_000, playingMs: 75_000, finalRushStartsAtMs: 60_000 });
    expect(7 * value.score.normalDifference + 3 * value.score.hardDifference).toBe(69);
    expect(value.tieBreak).toEqual(['SCORE', 'FINAL_PACKAGE_CORRECT', 'HARD_DIFFERENCES', 'FEWER_FINAL_ANSWER_ERRORS', 'SUDDEN_DEATH']);
    expect(rulesetHash(value)).toMatch(/^[a-f0-9]{64}$/);
  });

  for (const fixture of ['invalid-extra-property', 'invalid-time-order', 'invalid-score-semantics', 'invalid-schedule', 'invalid-tie-break']) {
    it(`rejects ${fixture} with a named rule`, async () => {
      const base = JSON.parse(await readFile(new URL('config/ruleset.v1.json', root), 'utf8'));
      const patch = JSON.parse(await readFile(new URL(`tests/fixtures/ruleset/${fixture}.json`, root), 'utf8'));
      const value = { ...base, ...patch, time: { ...base.time, ...patch.time }, score: { ...base.score, ...patch.score } };
      expect(() => parseRuleset(value)).toThrow(/RULESET_/);
    });
  }
});
