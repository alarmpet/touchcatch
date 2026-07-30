import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from './canonical-json.js';
import {
  loadProductionEconomy,
  normalizeFusionMaterials,
  admitDraftPetCatalog,
  parseEconomy,
  parsePetCatalog,
  pityTransition,
} from './economy.schema.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pityProjection = {
  thresholds: { rareOrBetter: 50, legendary: 150 },
  counterIncrementTiming: 'BEFORE_DRAW',
  counterIncrementSources: ['DIRECT_DRAW'],
  hardPityOverlapPrecedence: 'LEGENDARY',
  transformAlgorithmVersion: 'simulation-policy-v0',
  rareOverrideRule: 'COMMON_TO_RARE',
  legendaryOverrideRule: 'ALWAYS_LEGENDARY',
  rareResetRule: 'RARE_OR_BETTER',
  legendaryResetRule: 'LEGENDARY_RESETS_BOTH',
  fusionAffectsPity: false,
  eligibleResultSemantics: 'UNIFORM_WITHIN_RARITY',
} as const;

function catalog(status: 'DRAFT' | 'APPROVED' = 'DRAFT') {
  const entries = [
    ...Array.from({ length: 30 }, (_, i) => ({ petId: `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, rarity: 'COMMON', displayKey: `pet.common.${i + 1}`, coachArchetype: 'SCOUT' })),
    ...Array.from({ length: 15 }, (_, i) => ({ petId: `00000000-0000-4000-8000-${String(i+31).padStart(12,'0')}`, rarity: 'RARE', displayKey: `pet.rare.${i + 1}`, coachArchetype: 'CHEER' })),
    ...Array.from({ length: 5 }, (_, i) => ({ petId: `00000000-0000-4000-8000-${String(i+46).padStart(12,'0')}`, rarity: 'LEGENDARY', displayKey: `pet.legendary.${i + 1}`, coachArchetype: 'SAGE' })),
  ];
  const core = { schemaVersion: 1, catalogRevision: 'catalog-v1', entries };
  return {
    ...core,
    status,
    catalogHash: canonicalJsonSha256(core),
    ...(status === 'APPROVED' ? { approvalDecisionId: 'DECISION-1', approvedBy: 'product-owner', approvedAt: '2026-07-15T00:00:00.000Z' } : {}),
  };
}

function economy(status: 'DRAFT' | 'APPROVED' = 'DRAFT') {
  const cat = catalog(status);
  return {
    schemaVersion: 1,
    economyVersion: '1.0.0',
    status,
    catalogRevision: cat.catalogRevision,
    catalogHash: cat.catalogHash,
    pitySeriesId: 'pity-50-150-v1',
    pitySemantics: pityProjection,
    pitySemanticsHash: canonicalJsonSha256(pityProjection),
    draw: { cost: 100, probabilities: { COMMON: 0.8, RARE: 0.18, LEGENDARY: 0.02 } },
    fusion: { materialCount: 5, excludeSelected: true, excludeLocked: true },
    exp: { win: 100, loss: 60, perfectWordMeaning: 40 },
    simulationPolicy: 'simulation-policy-v0',
    rewardPolicies: {},
    ...(status === 'APPROVED' ? { approvalDecisionId: 'DECISION-1', approvedBy: 'product-owner', approvedAt: '2026-07-15T00:00:00.000Z' } : {}),
  };
}

describe('economy and catalog admission', () => {
  it.each([
    ['invalid-extra-property.json', 'economy', /additional/i],
    ['invalid-pity-threshold.json', 'economy', /threshold|rareOrBetter/i],
    ['invalid-pity-semantics-hash.json', 'economy', /pitySemanticsHash/i],
    ['invalid-approved-metadata.json', 'economy', /approvalDecisionId|approvedBy|approvedAt/i],
    ['invalid-protection.json', 'economy', /excludeLocked/i],
    ['invalid-pet-catalog.json', 'catalog', /30.*15.*5|coachArchetype|petId/],
  ] as const)('rejects fixture %s at its named %s rule', (file, kind, rule) => {
    const fixture = JSON.parse(readFileSync(resolve('tests/fixtures/economy', file), 'utf8')) as unknown;
    const parse = kind === 'economy' ? parseEconomy : parsePetCatalog;
    expect(() => parse(fixture)).toThrow(rule);
  });

  it('JSON Schema validates every nested baseline field and rejects real negative fixture mutations', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
    const economySchema = JSON.parse(readFileSync(resolve('schemas/economy.schema.json'), 'utf8'));
    const catalogSchema = JSON.parse(readFileSync(resolve('schemas/pet-catalog.schema.json'), 'utf8'));
    const validateEconomy = ajv.compile(economySchema);
    const validateCatalog = ajv.compile(catalogSchema);
    expect(validateEconomy(economy())).toBe(true);
    expect(validateCatalog(catalog())).toBe(true);
    const negatives = [
      { ...economy(), draw: { ...economy().draw, probabilities: { COMMON: 0.79, RARE: 0.18, LEGENDARY: 0.02 } } },
      { ...economy(), pitySemantics: { ...pityProjection, extra: true } },
      { ...economy(), exp: { ...economy().exp, win: 101 } },
    ];
    for (const fixture of negatives) expect(validateEconomy(fixture), JSON.stringify(validateEconomy.errors)).toBe(false);
  });
  it('strictly parses the DRAFT baseline but refuses it for production', () => {
    expect(parseEconomy(economy()).economyVersion).toBe('1.0.0');
    expect(parsePetCatalog(catalog()).entries).toHaveLength(50);
    expect(() => loadProductionEconomy(economy(), catalog(), {})).toThrow(/APPROVED/);
  });

  it('requires explicit coach archetypes from the strict parser', () => {
    const draft = catalog();
    delete (draft.entries[0] as { coachArchetype?: string }).coachArchetype;
    draft.catalogHash = canonicalJsonSha256({ schemaVersion: draft.schemaVersion, catalogRevision: draft.catalogRevision, entries: draft.entries });
    expect(() => parsePetCatalog(draft)).toThrow(/coachArchetype/i);
    const approved = catalog('APPROVED');
    delete (approved.entries[0] as { coachArchetype?: string }).coachArchetype;
    expect(() => parsePetCatalog(approved)).toThrow(/coachArchetype/i);
  });

  it('emits PET_COACH_ARCHETYPE_DEFAULTED only while admitting a DRAFT catalog', () => {
    const draft = catalog();
    delete (draft.entries[0] as { coachArchetype?: string }).coachArchetype;
    delete (draft as { catalogHash?: string }).catalogHash;
    const warnings: string[] = [];
    expect(admitDraftPetCatalog(draft, (warning) => warnings.push(warning.code)).entries[0]?.coachArchetype).toBe('CHEER');
    expect(warnings).toEqual(['PET_COACH_ARCHETYPE_DEFAULTED']);
  });

  it('rejects supplied stale hashes before DRAFT admission whether or not a default is needed', () => {
    const explicit = catalog();
    explicit.catalogHash = '0'.repeat(64);
    expect(() => admitDraftPetCatalog(explicit)).toThrow(/hashless/i);
    const needsDefault = catalog();
    delete (needsDefault.entries[0] as { coachArchetype?: string }).coachArchetype;
    needsDefault.catalogHash = 'f'.repeat(64);
    expect(() => admitDraftPetCatalog(needsDefault)).toThrow(/hashless/i);
  });

  it('returns a stable normalized catalog from a hashless DRAFT admission input', () => {
    const input = catalog();
    delete (input as { catalogHash?: string }).catalogHash;
    delete (input.entries[0] as { coachArchetype?: string }).coachArchetype;
    const first = admitDraftPetCatalog(input);
    const second = admitDraftPetCatalog(input);
    expect(first).toEqual(second);
    expect(parsePetCatalog(first)).toEqual(first);
  });

  it('pins canonical hashes to explicit parsed entries and remains stable when reparsed', () => {
    const parsed = parsePetCatalog(catalog());
    expect(canonicalJsonSha256({ schemaVersion: parsed.schemaVersion, catalogRevision: parsed.catalogRevision, entries: parsed.entries })).toBe(parsed.catalogHash);
    expect(parsePetCatalog(parsed)).toEqual(parsed);
  });

  it('requires opaque UUIDv4 identifiers for both DRAFT and APPROVED catalogs', () => {
    for (const petId of ['common-1', '00000000-0000-5000-8000-000000000001']) {
      const draft = catalog(); draft.entries[0]!.petId = petId;
      draft.catalogHash = canonicalJsonSha256({ schemaVersion: draft.schemaVersion, catalogRevision: draft.catalogRevision, entries: draft.entries });
      expect(() => parsePetCatalog(draft)).toThrow(/pattern|UUIDv4/i);
    }
  });

  it('rejects extra properties, stale hashes, invalid protection, and catalog grouping drift', () => {
    expect(() => parseEconomy({ ...economy(), extra: true })).toThrow(/additional/i);
    expect(() => parseEconomy({ ...economy(), pitySemanticsHash: '0'.repeat(64) })).toThrow(/pitySemanticsHash/);
    expect(() => parseEconomy({ ...economy(), fusion: { ...economy().fusion, excludeLocked: false } })).toThrow(/excludeLocked/);
    const bad = catalog();
    bad.entries[0]!.rarity = 'RARE';
    expect(() => parsePetCatalog(bad)).toThrow(/30.*15.*5/);
  });

  it('requires approval metadata and exact cross references for production', () => {
    expect(() => parseEconomy({ ...economy(), status: 'APPROVED' })).toThrow(/approval/);
    const approvedEconomy = economy('APPROVED');
    const approvedCatalog = catalog('APPROVED');
    const loaded = loadProductionEconomy(approvedEconomy, approvedCatalog, {
      economyHash: canonicalJsonSha256(approvedEconomy),
      catalogHash: approvedCatalog.catalogHash,
      pitySemanticsHash: approvedEconomy.pitySemanticsHash,
    });
    expect(loaded.catalog.entries).toHaveLength(50);
  });
});

describe('transaction normalization and pity boundaries', () => {
  it('keeps one physical final definition for each economy mutation entry point', () => {
    const migration = readFileSync(resolve('supabase/migrations/202607150004_economy_ledgers.sql'), 'utf8');
    for (const functionName of ['select_pet_v1', 'set_pet_lock_v1', 'fuse_pets_v1']) {
      const definitions = migration.match(new RegExp(`create(?: or replace)? function private\\.${functionName}\\(`, 'g')) ?? [];
      expect(definitions, `${functionName} must have one final definition`).toHaveLength(1);
    }
    expect(migration).not.toMatch(/alter function private\.fuse_pets_v1\([^;]+rename to/i);
    expect(migration).not.toMatch(/drop function private\.fuse_pets_impl_v1/i);
  });

  it('requires a strict unique fusion array totaling exactly five copies', () => {
    expect(() => normalizeFusionMaterials([{ userPetId: 'b', count: 2 }, { userPetId: 'a', count: 1 }, { userPetId: 'b', count: 2 }])).toThrow(/unique/i);
    expect(normalizeFusionMaterials([{ userPetId: 'b', count: 4 }, { userPetId: 'a', count: 1 }])).toEqual([
      { userPetId: 'a', count: 1 }, { userPetId: 'b', count: 4 },
    ]);
    expect(() => normalizeFusionMaterials([{ userPetId: 'a', count: 4 }])).toThrow(/five/i);
  });

  it('applies exact 49/50 and 149/150 transforms with legendary precedence and reset', () => {
    expect(pityTransition({ rareCounter: 49, legendaryCounter: 20 }, 'COMMON')).toEqual({ rarity: 'RARE', rareCounter: 0, legendaryCounter: 21 });
    expect(pityTransition({ rareCounter: 20, legendaryCounter: 149 }, 'COMMON')).toEqual({ rarity: 'LEGENDARY', rareCounter: 0, legendaryCounter: 0 });
    expect(pityTransition({ rareCounter: 49, legendaryCounter: 149 }, 'COMMON').rarity).toBe('LEGENDARY');
  });
});
