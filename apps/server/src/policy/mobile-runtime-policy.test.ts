import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMobileRuntimePolicy } from './mobile-runtime-policy.js';

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(path), 'utf8')) as Record<string, unknown>;

const draftEconomy = readJson('config/economy.v1.json');
const draftCatalog = readJson('config/pet-catalog.v1.json');
const draftDailyPetLoop = readJson('config/daily-pet-loop.v1.json');
const draftWeeklyCompetition = readJson('config/weekly-competition.v1.json');

const approval = {
  status: 'APPROVED',
  approvalDecisionId: 'runtime-policy-approval-2026-08-11',
  approvedBy: 'product-owner',
  approvedAt: '2026-08-11T09:30:00.000Z',
} as const;

function approvedBundle() {
  const catalog = { ...structuredClone(draftCatalog), ...approval };
  const economy = {
    ...structuredClone(draftEconomy),
    ...approval,
    catalogRevision: draftCatalog['catalogRevision'],
    catalogHash: draftCatalog['catalogHash'],
  };
  return {
    economy,
    catalog,
    dailyPetLoop: { ...structuredClone(draftDailyPetLoop), ...approval },
    weeklyCompetition: { ...structuredClone(draftWeeklyCompetition), ...approval },
  };
}

describe('mobile runtime policy gates', () => {
  it('returns named disabled states without throwing for the current DRAFT artifacts', () => {
    const state = loadMobileRuntimePolicy({
      economy: draftEconomy,
      catalog: draftCatalog,
      dailyPetLoop: draftDailyPetLoop,
      weeklyCompetition: draftWeeklyCompetition,
    });

    expect(state).toEqual({
      rewards: { enabled: false, code: 'REWARD_POLICY_NOT_APPROVED' },
      ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' },
    });
  });

  it('keeps reward and ranking approval gates independent', () => {
    const approved = approvedBundle();

    const rankingDraft = loadMobileRuntimePolicy({
      ...approved,
      weeklyCompetition: draftWeeklyCompetition,
    });
    expect(rankingDraft.rewards.enabled).toBe(true);
    expect(rankingDraft.ranking).toEqual({
      enabled: false,
      code: 'RANKING_POLICY_NOT_APPROVED',
    });

    const dailyDraft = loadMobileRuntimePolicy({
      ...approved,
      dailyPetLoop: draftDailyPetLoop,
    });
    expect(dailyDraft.rewards).toEqual({
      enabled: false,
      code: 'REWARD_POLICY_NOT_APPROVED',
    });
    expect(dailyDraft.ranking.enabled).toBe(true);
  });

  it('fails closed when an approved dependency uses a test-only approval identity', () => {
    const approved = approvedBundle();
    const testApprovedEconomy = {
      ...approved.economy,
      approvedBy: 'test-product-owner',
    };

    expect(loadMobileRuntimePolicy({
      ...approved,
      economy: testApprovedEconomy,
    })).toEqual({
      rewards: { enabled: false, code: 'REWARD_POLICY_NOT_APPROVED' },
      ranking: { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' },
    });
  });
});
