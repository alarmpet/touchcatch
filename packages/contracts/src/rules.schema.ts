import { Ajv2020, type ErrorObject } from 'ajv/dist/2020.js';
import schema from '../../../schemas/ruleset.schema.json' with { type: 'json' };
import frozenRuleset from '../../../config/ruleset.v1.json' with { type: 'json' };
import { canonicalJson, canonicalJsonSha256 } from './canonical-json.js';
import type { RulesetV1 } from './rules.js';

const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const chain = ['SCORE', 'FINAL_PACKAGE_CORRECT', 'HARD_DIFFERENCES', 'FEWER_FINAL_ANSWER_ERRORS', 'SUDDEN_DEATH'];

function invariant(ok: boolean, rule: string, path: string): void {
  if (!ok) throw new TypeError(`RULESET_${rule} at ${path}`);
}

export function parseRuleset(value: unknown): RulesetV1 {
  if (!validate(value)) {
    const error = validate.errors?.[0] as ErrorObject | undefined;
    throw new TypeError(`RULESET_SCHEMA at ${error?.instancePath || '/'}: ${error?.message ?? 'invalid'}`);
  }
  const rules = value as RulesetV1;
  invariant(rules.time.wordHuntRevealMs <= rules.time.wordHuntMs, 'WORD_HUNT_REVEAL', '/time/wordHuntRevealMs');
  invariant(rules.time.finalRushStartsAtMs < rules.time.playingMs && rules.time.playingMs <= rules.time.meaningSettlementCapMs, 'TIME_ORDER', '/time');
  invariant(rules.score.wrongAnswer < 0 && rules.score.finalRushWrongAnswer < 0, 'SCORE_SIGN', '/score');
  invariant(JSON.stringify(rules.tieBreak) === JSON.stringify(chain), 'TIE_BREAK_CHAIN', '/tieBreak');
  invariant(rules.content.normalDifferences === 7 && rules.content.hardDifferences === 3 && rules.content.wordHunts === 3, 'CONTENT_COUNTS', '/content');
  invariant(rules.hint.creditsPerWordHuntWin === 1 && rules.hint.charactersPerUse === 1 && rules.hint.revealOrder === 'MATCH_RANDOM_SCHEDULE', 'HINT', '/hint');
  invariant(rules.finalChallenge.maxWrongAttempts === 3 && rules.finalChallenge.atomicScoring === true, 'FINAL_CHALLENGE', '/finalChallenge');
  const [first, second, special] = rules.wordHuntSchedule;
  invariant(first.kind === 'NORMAL' && second.kind === 'NORMAL' && special.kind === 'SPECIAL', 'SCHEDULE_ORDER', '/wordHuntSchedule');
  invariant(first.spawnWindowMs[0] >= 0 && first.spawnWindowMs[0] < first.spawnWindowMs[1] && first.spawnWindowMs[1] <= second.spawnWindowMs[0] && second.spawnWindowMs[0] < second.spawnWindowMs[1], 'SCHEDULE_WINDOWS', '/wordHuntSchedule');
  invariant(first.spawnWindowMs[1] + rules.time.wordHuntMs <= second.spawnWindowMs[0] && second.spawnWindowMs[1] + rules.time.wordHuntMs <= special.spawnAtMs, 'SCHEDULE_OVERLAP', '/wordHuntSchedule');
  invariant(special.spawnAtMs === rules.time.finalRushStartsAtMs, 'SPECIAL_SPAWN', '/wordHuntSchedule/2/spawnAtMs');
  invariant(canonicalJson(rules) === canonicalJson(frozenRuleset), 'FROZEN_VALUE', '/');
  return rules;
}

export function rulesetHash(rules: RulesetV1): string { return canonicalJsonSha256(rules); }
