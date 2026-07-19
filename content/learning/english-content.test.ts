import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname);
const keys = ['en-resilience', 'en-dilemma', 'en-sustainability'] as const;

describe('English learning image pairs', () => {
  for (const key of keys) {
    it(`${key} has a verified DRAFT bundle`, async () => {
      const bundlePath = resolve(root, 'drafts', `${key}.json`);
      const evidencePath = resolve(root, 'evidence', `${key}.visual-delta.json`);
      const imageA = resolve(root, 'source', `${key}-a.png`);
      const imageB = resolve(root, 'source', `${key}-b.png`);
      await Promise.all([access(imageA), access(imageB), access(bundlePath), access(evidencePath)]);
      const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
      const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
      expect(bundle.publicContent.theme).toBe(key);
      expect(bundle.publicContent.language).toBe('en');
      expect(bundle.publicContent.difficulty).toBe('ADVANCED');
      expect(bundle.privateSolution.differences).toHaveLength(10);
      expect(bundle.status).toBe('DRAFT');
      expect(bundle.rightsReviewStatus).toBe('REVIEW_REQUIRED');
      expect(bundle.educationReviewStatus).toBe('REVIEW_REQUIRED');
      expect(evidence).toMatchObject({ dimensionsMatch: true, changedRegions: 10, outsidePolicy: 'PASS' });
      const differenceCircles = bundle.privateSolution.differences.map((item: { hitboxes: { imageA: { cx: number; cy: number; r: number } } }) => item.hitboxes.imageA);
      const challengeCircles = [
        ...bundle.privateSolution.wordHunts.map((item: { hitboxes: { imageA: { cx: number; cy: number; r: number } } }) => item.hitboxes.imageA),
        bundle.privateSolution.suddenDeath.hitboxes.imageA,
      ];
      for (const answer of differenceCircles) {
        for (const challenge of challengeCircles) {
          expect(Math.hypot(answer.cx - challenge.cx, answer.cy - challenge.cy)).toBeGreaterThanOrEqual(answer.r + challenge.r);
        }
      }
    });
  }
});
