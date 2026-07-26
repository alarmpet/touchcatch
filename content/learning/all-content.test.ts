import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname);

describe('nine-pack learning manifest', () => {
  it('contains exactly three verified drafts per category with unique immutable identities', async () => {
    const manifest = JSON.parse(await readFile(resolve(root, 'manifest.v1.json'), 'utf8'));
    expect(manifest.entries).toHaveLength(9);
    expect(Object.fromEntries(['ENGLISH', 'PROVERB', 'IDIOM'].map((category) => [category, manifest.entries.filter((entry: { category: string }) => entry.category === category).length]))).toEqual({ ENGLISH: 3, PROVERB: 3, IDIOM: 3 });
    expect(new Set(manifest.entries.map((entry: { key: string }) => entry.key)).size).toBe(9);
    expect(new Set(manifest.entries.map((entry: { contentId: string }) => entry.contentId)).size).toBe(9);
    expect(new Set(manifest.entries.map((entry: { contentRevisionId: string }) => entry.contentRevisionId)).size).toBe(9);
    expect(new Set(manifest.entries.flatMap((entry: { imageHashes: string[] }) => entry.imageHashes)).size).toBe(18);
    for (const entry of manifest.entries) {
      const bundle = JSON.parse(await readFile(resolve(root, entry.bundle), 'utf8'));
      const evidence = JSON.parse(await readFile(resolve(root, entry.evidence), 'utf8'));
      expect(bundle.status).toBe('DRAFT');
      expect(bundle.rightsReviewStatus).toBe('REVIEW_REQUIRED');
      expect(bundle.educationReviewStatus).toBe('REVIEW_REQUIRED');
      expect(evidence.outsidePolicy).toBe('PASS');
      expect(entry.qualitySha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
