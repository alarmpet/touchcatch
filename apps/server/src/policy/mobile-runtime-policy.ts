import {
  parseDailyPetLoopPolicyV1,
  type DailyPetLoopPolicyV1,
} from '../../../../packages/contracts/src/daily-pet-loop.js';
import {
  loadProductionEconomy,
  parseEconomy,
  parsePetCatalog,
} from '../../../../packages/contracts/src/economy.schema.js';
import {
  parseWeeklyCompetitionV1WithHash,
  type WeeklyCompetitionV1,
} from '../../../../packages/contracts/src/learning-policy.js';

type DisabledPolicyCode =
  | 'REWARD_POLICY_NOT_APPROVED'
  | 'RANKING_POLICY_NOT_APPROVED'
  | 'PET_ART_NOT_APPROVED';

export type MobileRuntimePolicyState =
  | Readonly<{ enabled: false; code: DisabledPolicyCode }>
  | Readonly<{
      enabled: true;
      economyVersion: string;
      economyHash: string;
      catalogRevision: string;
      catalogHash: string;
      competitionPolicyHash: string;
    }>;

export type MobileRuntimePolicy = Readonly<{
  rewards: MobileRuntimePolicyState;
  ranking: MobileRuntimePolicyState;
}>;

type ApprovalEnvelope = Readonly<{
  status: 'DRAFT' | 'APPROVED';
  approvalDecisionId?: string;
  approvedBy?: string;
}>;

function hasProductionApproval(artifact: ApprovalEnvelope): boolean {
  return artifact.status === 'APPROVED'
    && typeof artifact.approvalDecisionId === 'string'
    && !/^test-/i.test(artifact.approvalDecisionId)
    && typeof artifact.approvedBy === 'string'
    && !/^test-/i.test(artifact.approvedBy);
}

function dailyPolicyIsApproved(policy: DailyPetLoopPolicyV1): boolean {
  return hasProductionApproval(policy);
}

function competitionPolicyIsApproved(policy: WeeklyCompetitionV1): boolean {
  return hasProductionApproval(policy);
}

export function loadMobileRuntimePolicy(input: Readonly<{
  economy: unknown;
  catalog: unknown;
  dailyPetLoop: unknown;
  weeklyCompetition: unknown;
  petRuntimeArt?: unknown;
}>): MobileRuntimePolicy {
  const economy = parseEconomy(input.economy);
  const catalog = parsePetCatalog(input.catalog);
  const dailyPetLoop = parseDailyPetLoopPolicyV1(input.dailyPetLoop);
  const weeklyCompetition = parseWeeklyCompetitionV1WithHash(input.weeklyCompetition);

  let productionEconomy: ReturnType<typeof loadProductionEconomy> | null = null;
  if (hasProductionApproval(economy) && hasProductionApproval(catalog)) {
    try {
      productionEconomy = loadProductionEconomy(economy, catalog, {});
    } catch {
      productionEconomy = null;
    }
  }

  const sharedEnabledState = productionEconomy === null
    ? null
    : {
        enabled: true as const,
        economyVersion: productionEconomy.economyVersion,
        economyHash: productionEconomy.economyHash,
        catalogRevision: productionEconomy.catalogRevision,
        catalogHash: productionEconomy.catalogHash,
        competitionPolicyHash: weeklyCompetition.canonicalHash,
      };

  const rewards: MobileRuntimePolicyState = sharedEnabledState !== null
    && dailyPolicyIsApproved(dailyPetLoop)
    ? sharedEnabledState
    : { enabled: false, code: 'REWARD_POLICY_NOT_APPROVED' };

  const ranking: MobileRuntimePolicyState = sharedEnabledState !== null
    && competitionPolicyIsApproved(weeklyCompetition.policy)
    ? sharedEnabledState
    : { enabled: false, code: 'RANKING_POLICY_NOT_APPROVED' };

  return { rewards, ranking };
}
