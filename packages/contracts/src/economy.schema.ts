import { canonicalJsonSha256 } from './canonical-json.js';
import type { EconomyV1, LoadedApprovedEconomyV1 } from './economy.js';
import type { CoachArchetype, PetCatalogEntryV1, PetCatalogRevisionV1, PetRarity } from './pet-catalog.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import economyJsonSchema from '../../../schemas/economy.schema.json' with { type: 'json' };
import catalogJsonSchema from '../../../schemas/pet-catalog.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
const validateEconomyStructure = ajv.compile(economyJsonSchema);
const validateCatalogStructure = ajv.compile(catalogJsonSchema);

const economyKeys = new Set(['schemaVersion','economyVersion','status','catalogRevision','catalogHash','pitySeriesId','pitySemantics','pitySemanticsHash','draw','fusion','exp','simulationPolicy','rewardPolicies','approvalDecisionId','approvedBy','approvedAt']);
const catalogKeys = new Set(['schemaVersion','catalogRevision','status','catalogHash','entries','approvalDecisionId','approvedBy','approvedAt']);
const hashPattern = /^[0-9a-f]{64}$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: Set<string>, name: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.has(key));
  if (extra.length) throw new TypeError(`${name} has additional properties: ${extra.join(', ')}`);
}
function approval(value: Record<string, unknown>): void {
  if (value.status === 'APPROVED' && ['approvalDecisionId','approvedBy','approvedAt'].some((key) => typeof value[key] !== 'string' || value[key] === '')) throw new TypeError('APPROVED artifact requires approval metadata');
}

export function parsePetCatalog(input: unknown): PetCatalogRevisionV1 {
  if (!validateCatalogStructure(input)) throw new TypeError(`catalog schema: ${ajv.errorsText(validateCatalogStructure.errors)}`);
  const value = object(input, 'catalog'); exactKeys(value, catalogKeys, 'catalog'); approval(value);
  if (value.schemaVersion !== 1 || !['DRAFT','APPROVED'].includes(String(value.status)) || typeof value.catalogRevision !== 'string' || !Array.isArray(value.entries)) throw new TypeError('invalid catalog structure');
  const ids = new Set<string>(); const counts: Record<PetRarity, number> = { COMMON: 0, RARE: 0, LEGENDARY: 0 };
  const normalizedEntries: PetCatalogEntryV1[] = [];
  for (const raw of value.entries) {
    const entry = object(raw, 'catalog entry'); exactKeys(entry, new Set(['petId','rarity','displayKey','coachArchetype']), 'catalog entry');
    const coachArchetype = entry.coachArchetype ?? (value.status === 'DRAFT' ? 'CHEER' : undefined);
    if (typeof entry.petId !== 'string' || entry.petId === '' || ids.has(entry.petId) || (value.status === 'APPROVED' && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.petId)) || typeof entry.displayKey !== 'string' || !(entry.rarity === 'COMMON' || entry.rarity === 'RARE' || entry.rarity === 'LEGENDARY') || !(coachArchetype === 'SCOUT' || coachArchetype === 'LINGUIST' || coachArchetype === 'SAGE' || coachArchetype === 'CHEER')) throw new TypeError('catalog entries require unique opaque UUIDv4 IDs, valid rarity, and coachArchetype');
    ids.add(entry.petId); counts[entry.rarity] += 1;
    normalizedEntries.push({ petId: entry.petId, rarity: entry.rarity, displayKey: entry.displayKey, coachArchetype: coachArchetype as CoachArchetype });
  }
  if (counts.COMMON !== 30 || counts.RARE !== 15 || counts.LEGENDARY !== 5) throw new TypeError('catalog requires exact 30/15/5 rarity grouping');
  const projection = { schemaVersion: value.schemaVersion, catalogRevision: value.catalogRevision, entries: value.entries };
  if (!hashPattern.test(String(value.catalogHash)) || canonicalJsonSha256(projection) !== value.catalogHash) throw new TypeError('catalogHash mismatch');
  return { ...value, entries: normalizedEntries } as unknown as PetCatalogRevisionV1;
}

export function admitDraftPetCatalog(input: unknown, onWarning: (warning: { code: 'PET_COACH_ARCHETYPE_DEFAULTED'; petId: string }) => void = () => undefined): PetCatalogRevisionV1 {
  const catalog = parsePetCatalog(input);
  if (catalog.status !== 'DRAFT') throw new TypeError('only DRAFT catalogs may receive coachArchetype defaults');
  const rawEntries = object(input, 'catalog').entries;
  if (!Array.isArray(rawEntries)) throw new TypeError('catalog entries must be an array');
  rawEntries.forEach((raw, index) => {
    const entry = object(raw, 'catalog entry');
    if (entry.coachArchetype === undefined) onWarning({ code: 'PET_COACH_ARCHETYPE_DEFAULTED', petId: catalog.entries[index]!.petId });
  });
  return catalog;
}

export function parseEconomy(input: unknown): EconomyV1 {
  if (!validateEconomyStructure(input)) throw new TypeError(`economy schema: ${ajv.errorsText(validateEconomyStructure.errors)}`);
  const value = object(input, 'economy'); exactKeys(value, economyKeys, 'economy'); approval(value);
  if (value.schemaVersion !== 1 || !semverPattern.test(String(value.economyVersion)) || !['DRAFT','APPROVED'].includes(String(value.status))) throw new TypeError('invalid economy version/lifecycle');
  const pity = object(value.pitySemantics, 'pitySemantics'); const thresholds = object(pity.thresholds, 'thresholds');
  if (thresholds.rareOrBetter !== 50 || thresholds.legendary !== 150) throw new TypeError('pity threshold must be 50/150');
  if (canonicalJsonSha256(pity) !== value.pitySemanticsHash) throw new TypeError('pitySemanticsHash mismatch');
  const draw = object(value.draw, 'draw'); const probabilities = object(draw.probabilities, 'probabilities');
  const sum = Number(probabilities.COMMON) + Number(probabilities.RARE) + Number(probabilities.LEGENDARY);
  if (!(Number(draw.cost) > 0) || Math.abs(sum - 1) > 1e-12) throw new TypeError('draw cost/probabilities invalid');
  const fusion = object(value.fusion, 'fusion');
  if (fusion.materialCount !== 5 || fusion.excludeSelected !== true || fusion.excludeLocked !== true) throw new TypeError('fusion requires five materials and excludeSelected/excludeLocked protection');
  if (value.simulationPolicy !== 'simulation-policy-v0' || typeof value.catalogRevision !== 'string' || !hashPattern.test(String(value.catalogHash)) || typeof value.pitySeriesId !== 'string' || value.pitySeriesId === '') throw new TypeError('invalid economy references');
  return value as unknown as EconomyV1;
}

export function validateEconomyBundleCore(economyInput: unknown, catalogInput: unknown, expected: { economyHash?: string; catalogHash?: string; pitySemanticsHash?: string }): { economy: EconomyV1; catalog: PetCatalogRevisionV1; economyHash: string; catalogArtifactHash: string } {
  const economy = parseEconomy(economyInput); const catalog = parsePetCatalog(catalogInput);
  if (economy.catalogRevision !== catalog.catalogRevision || economy.catalogHash !== catalog.catalogHash) throw new TypeError('economy/catalog cross-reference mismatch');
  const economyHash = canonicalJsonSha256(economy); const catalogArtifactHash = canonicalJsonSha256(catalog);
  if (expected.economyHash && expected.economyHash !== economyHash) throw new TypeError('economyHash mismatch');
  if (expected.catalogHash && expected.catalogHash !== catalog.catalogHash) throw new TypeError('expected catalogHash mismatch');
  if (expected.pitySemanticsHash && expected.pitySemanticsHash !== economy.pitySemanticsHash) throw new TypeError('expected pitySemanticsHash mismatch');
  return { economy, catalog, economyHash, catalogArtifactHash };
}

export function loadProductionEconomy(economyInput: unknown, catalogInput: unknown, expected: { economyHash?: string; catalogHash?: string; pitySemanticsHash?: string }): LoadedApprovedEconomyV1 {
  const loaded = validateEconomyBundleCore(economyInput, catalogInput, expected);
  if (loaded.economy.status !== 'APPROVED' || loaded.catalog.status !== 'APPROVED') throw new TypeError('production economy and catalog must be APPROVED');
  if (loaded.economy.approvedBy?.startsWith('test-') || loaded.catalog.approvedBy?.startsWith('test-')) throw new TypeError('test-only approval metadata is forbidden in production');
  return { config: loaded.economy, economyVersion: loaded.economy.economyVersion, economyHash: loaded.economyHash, catalog: loaded.catalog, catalogRevision: loaded.catalog.catalogRevision, catalogHash: loaded.catalog.catalogHash, catalogArtifactHash: loaded.catalogArtifactHash, pitySeriesId: loaded.economy.pitySeriesId, pitySemanticsHash: loaded.economy.pitySemanticsHash, publishInput: { economy: { ...loaded.economy, economyHash: loaded.economyHash }, catalog: { ...loaded.catalog, catalogArtifactHash: loaded.catalogArtifactHash } } };
}

export function normalizeFusionMaterials(materials: ReadonlyArray<{ userPetId: string; count: number }>): Array<{ userPetId: string; count: number }> {
  const aggregate = new Map<string, number>();
  for (const item of materials) { if (!item.userPetId || !Number.isSafeInteger(item.count) || item.count <= 0) throw new TypeError('materials require positive integer counts'); if (aggregate.has(item.userPetId)) throw new TypeError('materials require unique userPetId values'); aggregate.set(item.userPetId, item.count); }
  const result = [...aggregate].sort(([a],[b]) => a.localeCompare(b)).map(([userPetId,count]) => ({ userPetId, count }));
  if (result.reduce((sum,item) => sum + item.count, 0) !== 5) throw new TypeError('fusion requires exactly five materials');
  return result;
}

export function pityTransition(state: { rareCounter: number; legendaryCounter: number }, rolled: PetRarity): { rarity: PetRarity; rareCounter: number; legendaryCounter: number } {
  const rareCounter = state.rareCounter + 1; const legendaryCounter = state.legendaryCounter + 1;
  const rarity: PetRarity = legendaryCounter >= 150 ? 'LEGENDARY' : rareCounter >= 50 && rolled === 'COMMON' ? 'RARE' : rolled;
  if (rarity === 'LEGENDARY') return { rarity, rareCounter: 0, legendaryCounter: 0 };
  return { rarity, rareCounter: rarity === 'RARE' ? 0 : rareCounter, legendaryCounter };
}
