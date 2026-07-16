import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256, rawBytesSha256 } from './canonical-json.js';
import { parseRuleset, rulesetHash } from './rules.schema.js';

const load = async () => JSON.parse(await readFile(new URL('../../../config/ruleset.v1.json', import.meta.url), 'utf8'));

describe('RulesetV1 parser', () => {
  it('binds the ruleset hash to the shared RFC 8785 helper', async () => {
    const rules = parseRuleset(await load());
    expect(rulesetHash(rules)).toBe(canonicalJsonSha256(rules));
  });

  it('rejects nested extra properties', async () => {
    const value = await load(); value.hint.extra = true;
    expect(() => parseRuleset(value)).toThrow('RULESET_SCHEMA');
  });

  it('keeps raw asset hashing distinct and byte-sensitive', () => {
    expect(rawBytesSha256(new Uint8Array([1, 2]))).not.toBe(rawBytesSha256(new Uint8Array([2, 1])));
  });
});
