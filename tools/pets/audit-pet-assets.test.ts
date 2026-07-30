import { describe, expect, it } from 'vitest';
import { auditPetAssets, normalizePetSlug } from './audit-pet-assets.js';

const desktopRoots = {
  commonRoot: 'C:\\Users\\petbl\\Desktop\\alarmpetgo_\\svg',
  rareRoot: 'C:\\Users\\petbl\\Desktop\\alarmpetgo_\\rare',
  legendaryRoot: 'C:\\Users\\petbl\\Desktop\\alarmpetgo_\\legend',
};
const minimalPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
]);

describe('pet asset audit', () => {
  it('discovers the supplied inventory without admitting non-PNG files or desktop paths', async () => {
    const { summary, catalog } = await auditPetAssets(desktopRoots);

    expect(summary).toMatchObject({
      commonCandidates: 35,
      rareCandidates: 35,
      legendaryCandidates: 18,
      dimensions: [{ width: 1024, height: 1536 }],
    });
    expect(summary.commonRarePairs).toHaveLength(35);
    expect(summary.rejected).toContainEqual(expect.objectContaining({ fileName: '새 텍스트 문서.txt', reason: 'UNSUPPORTED_FILE_TYPE' }));
    expect(JSON.stringify(catalog)).not.toContain('C:\\Users\\');
  });

  it('normalizes casing and spacing deterministically', () => {
    expect(normalizePetSlug(' Lion.png ')).toBe('lion');
    expect(normalizePetSlug('KOREAN   short-haired.PNG')).toBe('korean-short-haired');
    expect(normalizePetSlug('rare- American Shorthair.png', { stripRarePrefix: true })).toBe('american-shorthair');
  });

  it('rejects duplicate normalized slugs', async () => {
    await expect(auditPetAssets({
      ...desktopRoots,
      readEntries: async () => [
        { fileName: 'Lion.png', bytes: minimalPng, rarity: 'COMMON' as const },
        { fileName: ' lion .png', bytes: minimalPng, rarity: 'COMMON' as const },
      ],
    })).rejects.toThrow(/duplicate normalized slug/i);
  });
});
