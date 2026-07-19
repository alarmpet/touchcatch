import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname);
const entries = [
  ['ko-proverb-dark-under-lamp', '등잔 밑이 어둡다'],
  ['ko-proverb-seeing-is-believing', '백문이 불여일견'],
  ['ko-proverb-kind-words-return', '가는 말이 고와야 오는 말이 곱다'],
] as const;

describe('Korean proverb learning image pairs', () => {
  for (const [key, answer] of entries) {
    it(`${key} has a verified DRAFT bundle`, async () => {
      const paths = {
        a: resolve(root, 'source', `${key}-a.png`),
        b: resolve(root, 'source', `${key}-b.png`),
        bundle: resolve(root, 'drafts', `${key}.json`),
        evidence: resolve(root, 'evidence', `${key}.visual-delta.json`),
      };
      await Promise.all(Object.values(paths).map((file) => access(file)));
      const bundle = JSON.parse(await readFile(paths.bundle, 'utf8'));
      const evidence = JSON.parse(await readFile(paths.evidence, 'utf8'));
      expect(bundle.publicContent.theme).toBe(key);
      expect(bundle.privateSolution.finalChallenge.canonicalAnswer).toBe(answer);
      expect(bundle.privateSolution.differences).toHaveLength(10);
      expect(bundle.status).toBe('DRAFT');
      expect(bundle.rightsReviewStatus).toBe('REVIEW_REQUIRED');
      expect(bundle.educationReviewStatus).toBe('REVIEW_REQUIRED');
      expect(evidence).toMatchObject({ dimensionsMatch: true, changedRegions: 10, outsidePolicy: 'PASS' });
      const answers = bundle.privateSolution.differences.map((item: { hitboxes: { imageA: { cx: number; cy: number; r: number } } }) => item.hitboxes.imageA);
      const challenges = [
        ...bundle.privateSolution.wordHunts.map((item: { hitboxes: { imageA: { cx: number; cy: number; r: number } } }) => item.hitboxes.imageA),
        bundle.privateSolution.suddenDeath.hitboxes.imageA,
      ];
      for (const answerCircle of answers) {
        for (const challengeCircle of challenges) {
          expect(Math.hypot(answerCircle.cx - challengeCircle.cx, answerCircle.cy - challengeCircle.cy)).toBeGreaterThanOrEqual(answerCircle.r + challengeCircle.r);
        }
      }
    });
  }
});
