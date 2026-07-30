export type PetRarity = 'COMMON' | 'RARE' | 'LEGENDARY';
export type CoachArchetype = 'SCOUT' | 'LINGUIST' | 'SAGE' | 'CHEER';
export interface PetCatalogEntryV1 { petId: string; rarity: PetRarity; displayKey: string; coachArchetype: CoachArchetype }
export interface PetCatalogRevisionV1 {
  schemaVersion: 1;
  catalogRevision: string;
  status: 'DRAFT' | 'APPROVED';
  catalogHash: string;
  entries: PetCatalogEntryV1[];
  approvalDecisionId?: string;
  approvedBy?: string;
  approvedAt?: string;
}
