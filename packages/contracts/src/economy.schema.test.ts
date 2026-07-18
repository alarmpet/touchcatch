import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from './canonical-json.js';
import {
  loadProductionEconomy,
  normalizeFusionMaterials,
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
    ...Array.from({ length: 30 }, (_, i) => ({ petId: `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, rarity: 'COMMON', displayKey: `pet.common.${i + 1}` })),
    ...Array.from({ length: 15 }, (_, i) => ({ petId: `00000000-0000-4000-8000-${String(i+31).padStart(12,'0')}`, rarity: 'RARE', displayKey: `pet.rare.${i + 1}` })),
    ...Array.from({ length: 5 }, (_, i) => ({ petId: `00000000-0000-4000-8000-${String(i+46).padStart(12,'0')}`, rarity: 'LEGENDARY', displayKey: `pet.legendary.${i + 1}` })),
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
