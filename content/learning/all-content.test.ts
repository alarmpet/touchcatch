import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname);

describe('learning manifest identities', () => {
  it('contains exactly three verified drafts per category with unique immutable identities', async () => {
    const manifest = JSON.parse(await readFile(resolve(root, 'manifest.v1.json'), 'utf8'));
    expect(manifest.entries.length).toBeGreaterThanOrEqual(9);
    expect(new Set(manifest.entries.map((entry: { key: string }) => entry.key)).size).toBe(manifest.entries.length);
    expect(new Set(manifest.entries.map((entry: { contentId: string }) => entry.contentId)).size).toBe(manifest.entries.length);
    expect(new Set(manifest.entries.map((entry: { contentRevisionId: string }) => entry.contentRevisionId)).size).toBe(manifest.entries.length);
    expect(new Set(manifest.entries.flatMap((entry: { imageHashes: string[] }) => entry.imageHashes)).size).toBe(manifest.entries.length * 2);
    // Read the pack files concurrently: awaiting ~20 reads one at a time pushed this
    // past the 5s budget whenever the suite ran under parallel workers.
    const packs = await Promise.all(manifest.entries.map(async (entry: { bundle: string; evidence: string }) => ({
      bundle: JSON.parse(await readFile(resolve(root, entry.bundle), 'utf8')),
      evidence: JSON.parse(await readFile(resolve(root, entry.evidence), 'utf8')),
    })));
    for (const { bundle, evidence } of packs) {
      expect(bundle.status).toBe('DRAFT');
      expect(bundle.rightsReviewStatus).toBe('REVIEW_REQUIRED');
      expect(bundle.educationReviewStatus).toBe('REVIEW_REQUIRED');
      expect(evidence.outsidePolicy).toBe('PASS');
    }
  }, 30_000);
});
