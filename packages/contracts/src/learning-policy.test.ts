import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AnySchema } from 'ajv';
import addFormatsImport from 'ajv-formats';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from './canonical-json.js';
import {
  loadApprovedHintPolicyV1,
  loadApprovedLearningProgressionV1,
  loadApprovedWeeklyCompetitionV1,
  parseHintPolicyV1,
  parseHintPolicyV1WithHash,
  parseLearningProgressionV1,
  parseLearningProgressionV1WithHash,
  parseWeeklyCompetitionV1,
  parseWeeklyCompetitionV1WithHash,
} from './learning-policy.js';

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown;
const readSchema = (path: string): AnySchema =>
  readJson(path) as AnySchema;
const addFormats = addFormatsImport as unknown as (instance: Ajv2020) => Ajv2020;

const hintFixture = readJson('config/hint-policy.v1.json');
const progressionFixture = readJson('config/learning-progression.v1.json');
const competitionFixture = readJson('config/weekly-competition.v1.json');

type PolicyCase = Readonly<{
  name: string;
  fixture: unknown;
  schema: AnySchema;
  loadApproved: (input: unknown) => unknown;
}>;

const policyCases: readonly PolicyCase[] = [
  {
    name: 'hint',
    fixture: hintFixture,
    schema: readSchema('schemas/hint-policy.schema.json'),
    loadApproved: loadApprovedHintPolicyV1,
  },
  {
    name: 'progression',
    fixture: progressionFixture,
    schema: readSchema('schemas/learning-progression.schema.json'),
    loadApproved: loadApprovedLearningProgressionV1,
  },
  {
    name: 'competition',
    fixture: competitionFixture,
    schema: readSchema('schemas/weekly-competition.schema.json'),
    loadApproved: loadApprovedWeeklyCompetitionV1,
  },
] as const;

const canonicalApproval = {
  status: 'APPROVED',
  approvalDecisionId: 'decision-1',
  approvedBy: 'reviewer-1',
  approvedAt: '2026-07-30T10:00:00.000Z',
} as const;

const noncanonicalApprovalTimestamps = [
  '2026-07-30T10:00Z',
  '2026-07-30 10:00:00Z',
  '2026-07-30T10:00:00+09',
  '2026-07-30T10:00:00Z',
  '2026-07-30T10:00:00.00Z',
  '2026-07-30T10:00:00.000+09:00',
  '2016-12-31T23:59:60.000Z',
  '2026-02-30T10:00:00.000Z',
  'not-a-date',
] as const;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('test fixture must be an object');
  }
  return value as Record<string, unknown>;
}

function compileSchema(schema: AnySchema) {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

describe('learning policy contracts', () => {
  it('parses the exact authored-only five-step hint policy', () => {
    const parsed = parseHintPolicyV1(hintFixture);

    expect(parsed).toMatchObject({
      schemaVersion: '1.0.0',
      policyVersion: 'hint-policy-v1-candidate',
      status: 'APPROVED',
      stepsPerChallenge: 5,
      runtimeLlmGeneration: false,
      ranked: {
        petEffects: 'COSMETIC_ONLY',
        penaltyPerStep: 15_000,
      },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.ranked)).toBe(true);
  });

  it('parses the exact bounded progression candidates', () => {
    const parsed = parseLearningProgressionV1(progressionFixture);

    expect(parsed.accountXp).toEqual({
      firstCompletion: 30,
      allObjectivesCorrect: 10,
      noHint: 10,
      repeatPersonalBest: 5,
      dailyChallengeCap: 200,
    });
    expect(parsed.selectedPetXp).toEqual({
      firstCompletion: 15,
      allObjectivesCorrect: 5,
      noHint: 5,
      repeatPersonalBest: 2,
      dailyChallengeCap: 100,
    });
    expect(parsed.drawPoints).toEqual({
      firstCompletion: 10,
      weeklyCategoryParticipation: 20,
      dailyCap: 100,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.accountXp)).toBe(true);
    expect(Object.isFrozen(parsed.drawPoints)).toBe(true);
  });

  it('enables exactly the two MVP weekly categories and freezes the rank-one reward', () => {
    const parsed = parseWeeklyCompetitionV1(competitionFixture);

    expect(parsed).toMatchObject({
      schemaVersion: '1.0.0',
      policyVersion: 'weekly-competition-v1-candidate',
      status: 'APPROVED',
      timezone: 'Asia/Seoul',
      categories: ['ENGLISH', 'PROVERB'],
      disabledCategories: ['IDIOM', 'GENERAL_KNOWLEDGE'],
      challengesPerCategory: 5,
      rankedRecord: 'BEST_COMPLETED_VERIFIED',
      ranked: { petEffects: 'COSMETIC_ONLY' },
      rankOneReward: {
        rank: 1,
        rewardType: 'RARE_ONLY_TICKET_V1',
        quantity: 1,
        eligibleRarities: ['RARE'],
        selection: 'UNIFORM_WITHIN_PINNED_RARE',
        affectsDirectDrawPity: false,
      },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.categories)).toBe(true);
    expect(Object.isFrozen(parsed.disabledCategories)).toBe(true);
    expect(Object.isFrozen(parsed.ranked)).toBe(true);
    expect(Object.isFrozen(parsed.rankOneReward)).toBe(true);
    expect(Object.isFrozen(parsed.rankOneReward.eligibleRarities)).toBe(true);
  });

  it('returns a canonical hash with every parsed policy', () => {
    const parsed = [
      parseHintPolicyV1WithHash(hintFixture),
      parseLearningProgressionV1WithHash(progressionFixture),
      parseWeeklyCompetitionV1WithHash(competitionFixture),
    ];

    expect(parsed.map((result) => result.canonicalHash)).toEqual([
      canonicalJsonSha256(hintFixture),
      canonicalJsonSha256(progressionFixture),
      canonicalJsonSha256(competitionFixture),
    ]);
    for (const result of parsed) {
      expect(result.canonicalHash).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it.each(policyCases)('keeps the $name JSON Schema aligned with its DRAFT parser fixture', ({ fixture, schema }) => {
    const validate = compileSchema(schema);

    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(policyCases)(
    'admits the canonical millisecond UTC APPROVED $name policy through both validators',
    ({ fixture, schema, loadApproved }) => {
      const approved = { ...object(fixture), ...canonicalApproval };
      const validate = compileSchema(schema);

      expect(validate(approved), JSON.stringify(validate.errors)).toBe(true);
      expect(() => loadApproved(approved)).not.toThrow();
    },
  );

  for (const policyCase of policyCases) {
    it.each(noncanonicalApprovalTimestamps)(
      `rejects noncanonical or invalid ${policyCase.name} approvedAt %s through both validators`,
      (approvedAt) => {
        const approved = {
          ...object(policyCase.fixture),
          ...canonicalApproval,
          approvedAt,
        };
        const validate = compileSchema(policyCase.schema);

        expect(validate(approved), JSON.stringify(validate.errors)).toBe(false);
        expect(() => policyCase.loadApproved(approved)).toThrow();
      },
    );

    it.each([
      ['approvalDecisionId', ''],
      ['approvalDecisionId', '   '],
      ['approvedBy', ''],
      ['approvedBy', '   '],
    ])(
      `rejects empty or blank ${policyCase.name} %s through both validators`,
      (field, value) => {
        const approved = {
          ...object(policyCase.fixture),
          ...canonicalApproval,
          [field]: value,
        };
        const validate = compileSchema(policyCase.schema);

        expect(validate(approved), JSON.stringify(validate.errors)).toBe(false);
        expect(() => policyCase.loadApproved(approved)).toThrow();
      },
    );
  }

  it.each([
    {
      name: 'top-level hint key',
      parse: parseHintPolicyV1,
      value: { ...object(hintFixture), unknown: true },
    },
    {
      name: 'nested hint key',
      parse: parseHintPolicyV1,
      value: {
        ...object(hintFixture),
        ranked: { ...object(object(hintFixture).ranked), advantage: true },
      },
    },
    {
      name: 'nested progression key',
      parse: parseLearningProgressionV1,
      value: {
        ...object(progressionFixture),
        accountXp: {
          ...object(object(progressionFixture).accountXp),
          matchWin: 100,
        },
      },
    },
    {
      name: 'nested reward key',
      parse: parseWeeklyCompetitionV1,
      value: {
        ...object(competitionFixture),
        rankOneReward: {
          ...object(object(competitionFixture).rankOneReward),
          grantsLegendaryPity: true,
        },
      },
    },
  ])('rejects an unknown $name recursively', ({ parse, value }) => {
    expect(() => parse(value)).toThrow();
  });

  it.each([
    ['non-integer account XP', { firstCompletion: 30.5 }],
    ['negative account XP', { noHint: -1 }],
    ['non-integer selected-pet XP', { repeatPersonalBest: 2.5 }],
    ['negative draw points', { weeklyCategoryParticipation: -20 }],
  ])('rejects %s', (_name, patch) => {
    const fixture = object(progressionFixture);
    const target = 'weeklyCategoryParticipation' in patch
      ? 'drawPoints'
      : 'repeatPersonalBest' in patch
        ? 'selectedPetXp'
        : 'accountXp';

    expect(() => parseLearningProgressionV1({
      ...fixture,
      [target]: {
        ...object(fixture[target]),
        ...patch,
      },
    })).toThrow();
  });

  it.each([
    ['non-integer ticket quantity', 1.5],
    ['negative ticket quantity', -1],
  ])('rejects a %s', (_name, quantity) => {
    const fixture = object(competitionFixture);
    expect(() => parseWeeklyCompetitionV1({
      ...fixture,
      rankOneReward: {
        ...object(fixture.rankOneReward),
        quantity,
      },
    })).toThrow();
  });

  it('rejects duplicate or silently activated weekly categories', () => {
    const fixture = object(competitionFixture);

    expect(() => parseWeeklyCompetitionV1({
      ...fixture,
      categories: ['ENGLISH', 'ENGLISH'],
    })).toThrow();
    expect(() => parseWeeklyCompetitionV1({
      ...fixture,
      categories: ['ENGLISH', 'PROVERB', 'IDIOM'],
      disabledCategories: ['GENERAL_KNOWLEDGE'],
    })).toThrow();
  });

  it('rejects every ranked pet advantage', () => {
    const hint = object(hintFixture);
    const competition = object(competitionFixture);

    expect(() => parseHintPolicyV1({
      ...hint,
      ranked: {
        ...object(hint.ranked),
        petEffects: 'COACH_ADVANTAGE',
      },
    })).toThrow();
    expect(() => parseWeeklyCompetitionV1({
      ...competition,
      ranked: {
        petEffects: 'LEVEL_SCORE_MULTIPLIER',
      },
    })).toThrow();
  });

  it.each(['COMMON', 'LEGENDARY'])('rejects %s in the rare-only ticket', (rarity) => {
    const fixture = object(competitionFixture);
    expect(() => parseWeeklyCompetitionV1({
      ...fixture,
      rankOneReward: {
        ...object(fixture.rankOneReward),
        eligibleRarities: ['RARE', rarity],
      },
    })).toThrow();
  });

  it('fails closed when DRAFT policies are loaded for production', () => {
    expect(() => loadApprovedHintPolicyV1(hintFixture)).not.toThrow();
    expect(() => loadApprovedLearningProgressionV1(progressionFixture)).toThrow(/APPROVED/);
    expect(() => loadApprovedWeeklyCompetitionV1(competitionFixture)).not.toThrow();
  });

  it.each([
    ['approvalDecisionId', { approvedBy: 'reviewer', approvedAt: '2026-07-30T10:00:00.000Z' }],
    ['approvedBy', { approvalDecisionId: 'decision-1', approvedAt: '2026-07-30T10:00:00.000Z' }],
    ['approvedAt', { approvalDecisionId: 'decision-1', approvedBy: 'reviewer' }],
  ])('rejects APPROVED input missing %s', (_name, approvalFields) => {
    const base = object(hintFixture);
    delete base.approvalDecisionId;
    delete base.approvedBy;
    delete base.approvedAt;
    expect(() => loadApprovedHintPolicyV1({
      ...base,
      status: 'APPROVED',
      ...approvalFields,
    })).toThrow();
  });

  it('admits an APPROVED policy only with complete non-empty approval provenance', () => {
    const approved = loadApprovedHintPolicyV1({
      ...object(hintFixture),
      status: 'APPROVED',
      approvalDecisionId: 'decision-1',
      approvedBy: 'reviewer-1',
      approvedAt: '2026-07-30T10:00:00.000Z',
    });

    expect(approved.policy.status).toBe('APPROVED');
    expect(approved.policy.approvalDecisionId).toBe('decision-1');
    expect(approved.canonicalHash).toBe(canonicalJsonSha256(approved.policy));
  });

  it('keeps JSON Schemas strict for representative unsafe mutations', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    addFormats(ajv);
    const validators = Object.fromEntries(policyCases.map(({ name, schema }) => [
      name,
      ajv.compile(schema),
    ]));
    const hint = object(hintFixture);
    const progression = object(progressionFixture);
    const competition = object(competitionFixture);

    expect(validators.hint!({
      ...hint,
      ranked: { ...object(hint.ranked), petEffects: 'COACH_ADVANTAGE' },
    })).toBe(false);
    expect(validators.progression!({
      ...progression,
      accountXp: { ...object(progression.accountXp), firstCompletion: 30.5 },
    })).toBe(false);
    expect(validators.competition!({
      ...competition,
      categories: ['ENGLISH', 'ENGLISH'],
    })).toBe(false);
    expect(validators.competition!({
      ...competition,
      rankOneReward: {
        ...object(competition.rankOneReward),
        eligibleRarities: ['RARE', 'COMMON'],
      },
    })).toBe(false);
  });
});
