import type { PetCatalogRevisionV1, PetRarity } from './pet-catalog.js';

export type EconomyScope = 'DRAW_V1' | 'FUSION_V1' | 'SELECT_PET_V1' | 'SET_PET_LOCK_V1';
export type EconomyErrorCode = 'IDEMPOTENCY_CONFLICT' | 'POLICY_MISMATCH' | 'INSUFFICIENT_FUNDS' | 'NOT_OWNED' | 'INVALID_MATERIALS' | 'UNSUPPORTED_REWARD_POLICY' | 'UNSUPPORTED_SERIES_MIGRATION';
export interface PitySemanticsV1 {
  thresholds: { rareOrBetter: 50; legendary: 150 };
  counterIncrementTiming: 'BEFORE_DRAW';
  counterIncrementSources: ['DIRECT_DRAW'];
  hardPityOverlapPrecedence: 'LEGENDARY';
  transformAlgorithmVersion: 'simulation-policy-v0';
  rareOverrideRule: 'COMMON_TO_RARE';
  legendaryOverrideRule: 'ALWAYS_LEGENDARY';
  rareResetRule: 'RARE_OR_BETTER';
  legendaryResetRule: 'LEGENDARY_RESETS_BOTH';
  fusionAffectsPity: false;
  eligibleResultSemantics: 'UNIFORM_WITHIN_RARITY';
}
export interface EconomyV1 {
  schemaVersion: 1;
  economyVersion: string;
  status: 'DRAFT' | 'APPROVED';
  catalogRevision: string;
  catalogHash: string;
  pitySeriesId: string;
  pitySemantics: PitySemanticsV1;
  pitySemanticsHash: string;
  draw: { cost: number; probabilities: Record<PetRarity, number> };
  fusion: { materialCount: 5; excludeSelected: true; excludeLocked: true };
  exp: { win: 100; loss: 60; perfectWordMeaning: 40 };
  simulationPolicy: 'simulation-policy-v0';
  rewardPolicies: Record<string, number>;
  approvalDecisionId?: string;
  approvedBy?: string;
  approvedAt?: string;
}
export interface LoadedApprovedEconomyV1 {
  config: EconomyV1;
  economyVersion: string;
  economyHash: string;
  catalog: PetCatalogRevisionV1;
  catalogRevision: string;
  catalogHash: string;
  catalogArtifactHash: string;
  pitySeriesId: string;
  pitySemanticsHash: string;
  /** Exact, already-admitted JSON values accepted by publish_economy_bundle_v1. */
  publishInput: { economy: EconomyV1; catalog: PetCatalogRevisionV1 };
}
