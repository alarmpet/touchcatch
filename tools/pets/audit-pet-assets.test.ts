import { describe, expect, it } from 'vitest';
import { auditPetAssets, normalizePetSlug } from './audit-pet-assets.js';

const fixtureRoots = { commonRoot: 'fixture/common', rareRoot: 'fixture/rare', legendaryRoot: 'fixture/legendary' };
const minimalPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);

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
});
