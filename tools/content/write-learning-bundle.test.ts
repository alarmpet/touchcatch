import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { HintStepV1 } from '../../packages/contracts/src/content.js';
import {
  writeLearningBundle,
  type LearningBundleInput,
} from './write-learning-bundle.js';

const hintLadder: readonly HintStepV1[] = [
  {
    ordinal: 1,
    kind: 'SEMANTIC_CATEGORY',
    localizedText: {
      ko: '역경을 이겨 내는 힘을 나타내는 말이에요.',
      en: 'A quality for recovering from difficulty.',
    },
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 2,
    kind: 'CONTEXT_SENTENCE',
    localizedText: {
      ko: '공동체는 폭풍 뒤 놀라운 ____을 보여 주었어요.',
      en: 'The community showed remarkable ____ after the storm.',
    },
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 3,
    kind: 'ANSWER_LENGTH',
    localizedText: { ko: '정답은 10글자예요.', en: 'The answer has 10 graphemes.' },
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 4,
    kind: 'REVEAL_GRAPHEME',
    localizedText: { ko: '첫 글자를 공개해요.', en: 'Reveal the first grapheme.' },
    revealIndexes: [0],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 5,
    kind: 'REVEAL_GRAPHEME',
    localizedText: {
      ko: '남은 글자를 번갈아 공개해요.',
      en: 'Reveal alternating unrevealed graphemes.',
    },
    revealIndexes: [1, 3, 5, 7, 9],
    rankedPenaltyUnits: 1,
  },
];

const entry: LearningBundleInput = {
  key: 'test-key',
  category: 'ENGLISH',
  language: 'en',
  difficulty: 'ADVANCED',
  canonicalAnswer: 'resilience',
  aliases: ['resiliency'],
  hintLadder,
  meaning: {
    prompt: 'Meaning?',
    options: [
      { id: 'option_1', label: 'recovery' },
      { id: 'option_2', label: 'isolation' },
      { id: 'option_3', label: 'delay' },
    ],
    correctOptionId: 'option_1',
  },
};

async function withImages(
  action: (imageA: string, imageB: string, output: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(resolve(tmpdir(), 'learning-bundle-'));
  try {
    const imageA = resolve(dir, 'a.png');
    const imageB = resolve(dir, 'b.png');
    await writeFile(
      imageA,
      await sharp({
        create: { width: 64, height: 64, channels: 4, background: '#ffffff' },
      })
        .png()
        .toBuffer(),
    );
    await writeFile(
      imageB,
      await sharp({
        create: { width: 64, height: 64, channels: 4, background: '#eeeeee' },
      })
        .png()
        .toBuffer(),
    );
    await action(imageA, imageB, resolve(dir, 'bundle.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('learning bundle writer', () => {
  it('writes authored ladders separately from canonical grapheme units', async () => {
    await withImages(async (imageA, imageB, output) => {
      const result = await writeLearningBundle(entry, imageA, imageB, output);

      expect(result.publicContent.category).toBe('ENGLISH');
      expect(result.publicContent.imageA.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.publicContent.imageB.sha256).not.toBe(
        result.publicContent.imageA.sha256,
      );
      expect(result.privateSolution.finalChallenge.hintUnits).toEqual(
        [
          ...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(
            'resilience',
          ),
        ].map(({ segment }) => segment),
      );
      expect(result.privateSolution.finalChallenge.hintLadder).toEqual(hintLadder);
      expect(result.privateSolution.finalChallenge.hintLadder).not.toEqual(
        result.privateSolution.finalChallenge.hintUnits,
      );
      expect(result.privateSolution.privateSolutionHash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(result);
    });
  });

  it('rebuilds a legacy bundle while omitting a missing authored ladder', async () => {
    await withImages(async (imageA, imageB, output) => {
      const { hintLadder: _ignored, ...legacyEntry } = entry;
      const result = await writeLearningBundle(
        legacyEntry,
        imageA,
        imageB,
        output,
      );

      expect(result.privateSolution.finalChallenge).not.toHaveProperty('hintLadder');
    });
  });
});
