import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256, rawBytesSha256 } from './canonical-json.js';
import { parseRuleset, rulesetHash } from './rules.schema.js';
import frozen from '../../../config/ruleset.v1.json' with { type: 'json' };

const load = async () => JSON.parse(await readFile(new URL('../../../config/ruleset.v1.json', import.meta.url), 'utf8'));

describe('RulesetV1 parser', () => {
  it('binds the ruleset hash to the shared RFC 8785 helper', async () => {
    const rules = parseRuleset(await load());
    expect(rulesetHash(rules)).toBe(canonicalJsonSha256(rules));
  });

  it('matches the complete frozen object and a fixed canonical hash', async () => {
    const rules = parseRuleset(await load());
    expect(rules).toEqual(frozen);
    expect(rulesetHash(rules)).toBe('c2a4e3de9f3df4d34c5e84c47386afa68af1867623559c91bf26163cb02bcbd3');
  });

  const mutations: Array<[string, (value: any) => void]> = [
    ['targetScore', (v) => { v.targetScore += 1; }], ['scoreFloor', (v) => { v.scoreFloor += 1; }],
    ...Object.keys(frozen.time).map((key) => [`time.${key}`, (v: any) => { v.time[key] += 1; }] as [string, (value: any) => void]),
    ...Object.keys(frozen.score).map((key) => [`score.${key}`, (v: any) => { v.score[key] += 1; }] as [string, (value: any) => void]),
    ...Object.keys(frozen.lockMs).map((key) => [`lockMs.${key}`, (v: any) => { v.lockMs[key] += 1; }] as [string, (value: any) => void]),
    ['limits.maxBoardTapsPerSecond', (v) => { v.limits.maxBoardTapsPerSecond += 1; }],
    ...Object.keys(frozen.hint).map((key) => [`hint.${key}`, (v: any) => { v.hint[key] = typeof v.hint[key] === 'number' ? v.hint[key] + 1 : 'OTHER'; }] as [string, (value: any) => void]),
    ...Object.keys(frozen.content).map((key) => [`content.${key}`, (v: any) => { v.content[key] += 1; }] as [string, (value: any) => void]),
    ['finalChallenge.unlock.atMs', (v) => { v.finalChallenge.unlock.atMs += 1; }],
    ['finalChallenge.unlock.onDifferenceClaim', (v) => { v.finalChallenge.unlock.onDifferenceClaim = false; }],
    ['finalChallenge.unlock.onWordHuntClaim', (v) => { v.finalChallenge.unlock.onWordHuntClaim = false; }],
    ['finalChallenge.maxWrongAttempts', (v) => { v.finalChallenge.maxWrongAttempts += 1; }],
    ['finalChallenge.atomicScoring', (v) => { v.finalChallenge.atomicScoring = false; }],
    ['schedule[0].kind', (v) => { v.wordHuntSchedule[0].kind = 'SPECIAL'; }],
    ['schedule[0].from', (v) => { v.wordHuntSchedule[0].spawnWindowMs[0] += 1; }],
    ['schedule[0].to', (v) => { v.wordHuntSchedule[0].spawnWindowMs[1] += 1; }],
    ['schedule[1].kind', (v) => { v.wordHuntSchedule[1].kind = 'SPECIAL'; }],
    ['schedule[1].from', (v) => { v.wordHuntSchedule[1].spawnWindowMs[0] += 1; }],
    ['schedule[1].to', (v) => { v.wordHuntSchedule[1].spawnWindowMs[1] += 1; }],
    ['schedule[2].kind', (v) => { v.wordHuntSchedule[2].kind = 'NORMAL'; }],
    ['schedule[2].at', (v) => { v.wordHuntSchedule[2].spawnAtMs += 1; }],
    ...frozen.tieBreak.map((_, index) => [`tieBreak[${index}]`, (v: any) => { v.tieBreak[index] = v.tieBreak[(index + 1) % v.tieBreak.length]; }] as [string, (value: any) => void]),
  ];

  it.each(mutations)('rejects a frozen-value mutation at %s', async (_name, mutate) => {
    const value = await load(); mutate(value);
    expect(() => parseRuleset(value)).toThrow(/RULESET_/);
  });

  it('rejects nested extra properties', async () => {
    const value = await load(); value.hint.extra = true;
    expect(() => parseRuleset(value)).toThrow('RULESET_SCHEMA');
  });

  it('keeps raw asset hashing distinct and byte-sensitive', () => {
    expect(rawBytesSha256(new Uint8Array([1, 2]))).not.toBe(rawBytesSha256(new Uint8Array([2, 1])));
  });
});
