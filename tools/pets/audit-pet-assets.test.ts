import { describe, expect, it } from 'vitest';
import { auditPetAssets, normalizePetSlug } from './audit-pet-assets.js';

const fixtureRoots = { commonRoot: 'fixture/common', rareRoot: 'fixture/rare', legendaryRoot: 'fixture/legendary' };
const minimalPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(minimalPng);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

describe('pet asset audit', () => {
  it('rejects a non-PNG fixture without emitting source roots into the catalog', async () => {
    const { summary, catalog } = await auditPetAssets({
      ...fixtureRoots,
      readEntries: async () => [
        { fileName: 'Lion.png', bytes: minimalPng, rarity: 'COMMON' as const },
        { fileName: 'notes.txt', bytes: new Uint8Array(), rarity: 'COMMON' as const },
      ],
    });

    expect(summary).toMatchObject({ commonCandidates: 1, rareCandidates: 0, legendaryCandidates: 0, dimensions: [{ width: 1, height: 1 }] });
    expect(summary.rejected).toContainEqual({ fileName: 'notes.txt', reason: 'UNSUPPORTED_FILE_TYPE' });
    expect(JSON.stringify(catalog)).not.toContain('fixture/');
  });

  it('normalizes casing, spacing, and accents deterministically', () => {
    expect(normalizePetSlug(' Lion.png ')).toBe('lion');
    expect(normalizePetSlug('KOREAN   short-haired.PNG')).toBe('korean-short-haired');
    expect(normalizePetSlug('rare- American Shorthair.png', { stripRarePrefix: true })).toBe('american-shorthair');
    expect(normalizePetSlug('Crème Brûlée.png')).toBe('creme-brulee');
  });

  it('rejects duplicate normalized slugs', async () => {
    await expect(auditPetAssets({
      ...fixtureRoots,
      readEntries: async () => [
        { fileName: 'Lion.png', bytes: minimalPng, rarity: 'COMMON' as const },
        { fileName: ' lion .png', bytes: minimalPng, rarity: 'COMMON' as const },
      ],
    })).rejects.toThrow(/duplicate normalized slug/i);
  });

  it('audits the complete synthetic 35/35/18 inventory and its 35 transformation families', async () => {
    const art = pngHeader(1024, 1536);
    const paired = Array.from({ length: 35 }, (_, index) => `animal-${String(index + 1).padStart(2, '0')}`);
    const entries = [
      ...paired.map((fileName) => ({ fileName: `${fileName}.png`, bytes: art, rarity: 'COMMON' as const })),
      ...paired.map((fileName) => ({ fileName: `rare-${fileName}.png`, bytes: art, rarity: 'RARE' as const })),
      ...Array.from({ length: 18 }, (_, index) => ({ fileName: `legend-${String(index + 1).padStart(2, '0')}.png`, bytes: art, rarity: 'LEGENDARY' as const })),
    ];
    const { summary } = await auditPetAssets({ ...fixtureRoots, readEntries: async () => entries });
    expect(summary).toMatchObject({ commonCandidates: 35, rareCandidates: 35, legendaryCandidates: 18, dimensions: [{ width: 1024, height: 1536 }] });
    expect(summary.commonRarePairs).toHaveLength(35);
  });
});
