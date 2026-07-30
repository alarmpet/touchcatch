import { describe, expect, it } from 'vitest';
import type { DailyFreeDrawV1 } from '../../../../packages/contracts/src/daily-pet-loop.js';
import type { PetRarity } from '../../../../packages/contracts/src/pet-catalog.js';
import {
  claimDailyFreeDrawV1,
  kstClaimDateV1,
  type DailyDrawRepositoryV1,
} from './daily-draw.js';

const subjectKey = '70000000-0000-4000-8000-000000000001';
const pinnedPolicy = {
  economyVersion: '1.0.0',
  economyHash: 'a'.repeat(64),
  catalogRevision: 'catalog-v1',
  catalogHash: 'b'.repeat(64),
} as const;

class EffectOnceRepository implements DailyDrawRepositoryV1 {
  readonly claims = new Map<string, DailyFreeDrawV1>();
  readonly directDrawPity = { rareCounter: 49, legendaryCounter: 149 };

  async claimEffectOnce(input: Parameters<DailyDrawRepositoryV1['claimEffectOnce']>[0]): Promise<DailyFreeDrawV1> {
    const key = `${input.subjectKey}:${input.claimDate}:${input.seriesId}`;
    await Promise.resolve();
    const existing = this.claims.get(key);
    if (existing) return existing;
    const rarity: PetRarity = 'COMMON';
    const response: DailyFreeDrawV1 = {
      claimDate: input.claimDate,
      seriesId: 'DAILY_FREE_DRAW_V1',
      pet: { userPetId: '40000000-0000-4000-8000-000000000001', petId: '00000000-0000-4000-8000-000000000001', rarity, copies: 1 },
      ...pinnedPolicy,
    };
    this.claims.set(key, response);
    return response;
  }
}

describe('server-authoritative daily free draw', () => {
  it('derives the KST claim date across the UTC boundary', () => {
    expect(kstClaimDateV1(new Date('2026-07-29T14:59:59.999Z'))).toBe('2026-07-29');
    expect(kstClaimDateV1(new Date('2026-07-29T15:00:00.000Z'))).toBe('2026-07-30');
  });

  it('collapses 20 concurrent claims to one daily result without touching DIRECT_DRAW pity', async () => {
    const repository = new EffectOnceRepository();
    const before = { ...repository.directDrawPity };
    const calls = Array.from({ length: 20 }, () => claimDailyFreeDrawV1({
      subjectKey,
      now: new Date('2026-07-29T15:00:00.000Z'),
      policy: { status: 'APPROVED', ...pinnedPolicy },
      repository,
    }));

    const results = await Promise.all(calls);

    expect(results).toEqual(Array(20).fill(expect.objectContaining({ claimDate: '2026-07-30' })));
    expect(new Set(results.map((result) => JSON.stringify(result)))).toHaveLength(1);
    expect(repository.claims).toHaveLength(1);
    expect(repository.directDrawPity).toEqual(before);
  });

  it('replays the stored response and never accumulates missed draws', async () => {
    const repository = new EffectOnceRepository();
    const first = await claimDailyFreeDrawV1({
      subjectKey,
      now: new Date('2026-07-29T15:00:00.000Z'),
      policy: { status: 'APPROVED', ...pinnedPolicy },
      repository,
    });
    const retry = await claimDailyFreeDrawV1({
      subjectKey,
      now: new Date('2026-07-30T14:59:59.999Z'),
      policy: { status: 'APPROVED', ...pinnedPolicy },
      repository,
    });
    const nextDay = await claimDailyFreeDrawV1({
      subjectKey,
      now: new Date('2026-07-30T15:00:00.000Z'),
      policy: { status: 'APPROVED', ...pinnedPolicy },
      repository,
    });

    expect(retry).toEqual(first);
    expect(nextDay.claimDate).toBe('2026-07-31');
    expect(repository.claims).toHaveLength(2);
  });

  it('fails closed for an unapproved policy pin', async () => {
    await expect(claimDailyFreeDrawV1({
      subjectKey,
      now: new Date(),
      policy: { status: 'DRAFT', ...pinnedPolicy },
      repository: new EffectOnceRepository(),
    })).rejects.toThrow(/APPROVED/);
  });
});
