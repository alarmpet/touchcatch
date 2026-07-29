import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildPlayableRegistry,
  generatePlayableRegistry,
  validatePlayableBundle,
} from './generate-playable-registry.js';

const root = process.cwd();

async function fixture() {
  return JSON.parse(
    await readFile('content/learning/drafts/en-resilience.json', 'utf8'),
  );
}

describe('device playable registry', () => {
  it('projects exactly the three approved device packs', async () => {
    const result = await buildPlayableRegistry(root);
    expect(result.entries.map((entry) => entry.key)).toEqual([
      'en-resilience',
      'en-dilemma',
      'en-sustainability',
    ]);
    expect(result.entries.every((entry) => entry.differenceCount === 10)).toBe(true);
    expect(result.entries.every((entry) => entry.normalCount === 7)).toBe(true);
    expect(result.entries.every((entry) => entry.hardCount === 3)).toBe(true);
  });

  it('rejects duplicate objectives', async () => {
    const bundle = await fixture();
    bundle.privateSolution.differences[1].objectiveId =
      bundle.privateSolution.differences[0].objectiveId;
    expect(() => validatePlayableBundle('en-resilience', bundle)).toThrow(
      'DUPLICATE_OBJECTIVE',
    );
  });

  it('rejects tier drift', async () => {
    const bundle = await fixture();
    bundle.privateSolution.differences[6].tier = 'HARD';
    expect(() => validatePlayableBundle('en-resilience', bundle)).toThrow(
      'INVALID_TIER_COUNTS',
    );
  });

  it('rejects hitboxes outside normalized bounds', async () => {
    const bundle = await fixture();
    bundle.privateSolution.differences[0].hitboxes.imageA.cx = 1.1;
    expect(() => validatePlayableBundle('en-resilience', bundle)).toThrow(
      'INVALID_HITBOX',
    );
  });

  it('rejects a missing correct quiz option', async () => {
    const bundle = await fixture();
    bundle.privateSolution.finalChallenge.meaning.correctOptionId = 'missing';
    expect(() => validatePlayableBundle('en-resilience', bundle)).toThrow(
      'INVALID_CORRECT_OPTION',
    );
  });

  it('detects generated registry drift', async () => {
    await expect(generatePlayableRegistry(root, true)).resolves.toBeUndefined();
  });
});
