import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  dailyPetLoopPolicyV1Schema,
  parseDailyPetLoopPolicyV1,
  petCollectionV1Schema,
  petCollectionItemV1Schema,
  petShowcaseV1Schema,
} from './daily-pet-loop.js';

const policy = JSON.parse(readFileSync(resolve('config/daily-pet-loop.v1.json'), 'utf8')) as unknown;
const jsonSchema = JSON.parse(readFileSync(resolve('schemas/daily-pet-loop.schema.json'), 'utf8')) as object;

describe('daily pet loop contract', () => {
  it('pins the DRAFT daily rarity candidates and duplicate promotion thresholds', () => {
    const parsed = parseDailyPetLoopPolicyV1(policy);
    expect(parsed.status).toBe('DRAFT');
    expect(parsed.dailyDraw.probabilities).toEqual({ COMMON: 0.8, RARE: 0.18, LEGENDARY: 0.02 });
    expect(parsed.duplicatePromotion).toEqual({
      seriesId: 'DAILY_PET_PROMOTION_V1',
      ownedCopiesRequired: 11,
      spareCopiesConsumed: 10,
      retainBaseCopies: 1,
      transitions: { COMMON: 'RARE', RARE: 'LEGENDARY' },
      legendaryOutcome: 'COSMETIC_REWARD_POLICY_REQUIRED',
    });
  });

  it('keeps daily promotion in its own economy series', () => {
    const parsed = parseDailyPetLoopPolicyV1(policy);
    expect(parsed.duplicatePromotion.seriesId).toBe('DAILY_PET_PROMOTION_V1');
    expect(parsed.dailyDraw.seriesId).toBe('DAILY_FREE_DRAW_V1');
  });

  it('requires complete canonical approval metadata when the daily loop is approved', () => {
    const approved = {
      ...(policy as Record<string, unknown>),
      status: 'APPROVED',
      approvalDecisionId: 'daily-pet-loop-approval-2026-08-11',
      approvedBy: 'product-owner',
      approvedAt: '2026-08-11T09:30:00.000Z',
    };

    expect(parseDailyPetLoopPolicyV1(approved).status).toBe('APPROVED');

    for (const approvalField of ['approvalDecisionId', 'approvedBy', 'approvedAt'] as const) {
      const incomplete = { ...approved };
      delete incomplete[approvalField];
      expect(
        () => parseDailyPetLoopPolicyV1(incomplete),
        `missing ${approvalField}`,
      ).toThrow();
    }

    expect(() => parseDailyPetLoopPolicyV1({
      ...approved,
      approvedAt: '2026-08-11T18:30:00+09:00',
    })).toThrow();
  });

  it('applies the approved lifecycle envelope in the published JSON Schema', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validate = ajv.compile(jsonSchema);
    const approved = {
      ...(policy as Record<string, unknown>),
      status: 'APPROVED',
      approvalDecisionId: 'daily-pet-loop-approval-2026-08-11',
      approvedBy: 'product-owner',
      approvedAt: '2026-08-11T09:30:00.000Z',
    };

    expect(validate(approved), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...approved, approvalDecisionId: undefined })).toBe(false);
    expect(validate({ ...approved, approvedAt: '2026-08-11T18:30:00+09:00' })).toBe(false);
  });

  it('keeps the JSON Schema and runtime parser strict', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true });
    const validate = ajv.compile(jsonSchema);
    expect(validate(policy), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({
      ...(policy as Record<string, unknown>),
      dailyDraw: {
        ...((policy as { dailyDraw: Record<string, unknown> }).dailyDraw),
        probabilities: { COMMON: 0.79, RARE: 0.19, LEGENDARY: 0.02 },
      },
    })).toBe(false);
    expect(() => parseDailyPetLoopPolicyV1({ ...(policy as object), privateKey: 'leak' })).toThrow(/additional|unrecognized/i);
    expect(dailyPetLoopPolicyV1Schema.parse(policy)).toEqual(policy);
  });

  it.each([
    { userId: 'auth-id' },
    { authId: 'auth-id' },
    { email: 'private@example.test' },
    { subjectKey: 'private-economy-key' },
    { acquisitionHistory: [] },
    { biography: 'user-authored' },
    { location: 'Seoul' },
  ])('rejects private showcase input keys: %o', (privateField) => {
    expect(() => petShowcaseV1Schema.parse({
      nickname: 'Miso',
      selectedPet: null,
      favoritePets: [],
      collectionPercentage: 0,
      championStarCount: 0,
      historicalNumberOneCount: 0,
      approvedCosmetics: [],
      ...privateField,
    })).toThrow();
  });

  it('requires explicit nullable acquisition provenance', () => {
    const base = {
      userPetId: 'owned-a',
      petId: 'pet-a',
      rarity: 'COMMON',
      displayKey: 'pet.a',
      level: 1,
      xp: 0,
      copies: 1,
      selected: false,
      locked: false,
      art: {
        thumbnailUrl: 'https://cdn.touchcatch.test/thumb.webp',
        fullUrl: 'https://cdn.touchcatch.test/full.webp',
        assetSha256: 'a'.repeat(64),
      },
    };
    expect(petCollectionItemV1Schema.parse({
      ...base,
      acquiredAt: null,
      acquisitionDateStatus: 'UNAVAILABLE_LEGACY',
    })).toEqual(expect.objectContaining({ acquiredAt: null }));
    expect(() => petCollectionItemV1Schema.parse({
      ...base,
      acquiredAt: null,
      acquisitionDateStatus: 'KNOWN',
    })).toThrow(/acquiredAt|string/i);
  });

  it('requires authoritative daily-claim restoration in collection projections', () => {
    const projection = {
      claimedToday: true,
      ownedCount: 0,
      totalCount: 0,
      rarityProgress: {
        COMMON: { ownedCount: 0, totalCount: 0 },
        RARE: { ownedCount: 0, totalCount: 0 },
        LEGENDARY: { ownedCount: 0, totalCount: 0 },
      },
      pets: [],
    };
    expect(petCollectionV1Schema.parse(projection).claimedToday).toBe(true);
    const { claimedToday: _missing, ...withoutClaimStatus } = projection;
    expect(() => petCollectionV1Schema.parse(withoutClaimStatus)).toThrow();
  });
});
