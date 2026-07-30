import { expect, it } from 'vitest';
import { buildDemoEntry } from './data.js';

it('maps a verified draft bundle and local assets into playable content', () => {
  const hintLadder = [
    {
      ordinal: 1 as const,
      kind: 'DEFINITION' as const,
      localizedText: { ko: '뜻', en: 'Definition' },
      revealIndexes: [],
      rankedPenaltyUnits: 1 as const,
    },
  ];
  const bundle = {
    publicContent: { theme: 'demo' },
    privateSolution: {
      differences: [{ objectiveId: 'd', hitboxes: { imageA: { cx: .1, cy: .2, r: .03 }, imageB: { cx: .2, cy: .3, r: .04 } } }],
      finalChallenge: {
        canonicalAnswer: 'answer',
        hintUnits: ['a', 'n', 's', 'w', 'e', 'r'],
        hintLadder,
        meaning: { prompt: 'Meaning?', options: [{ id: 'yes', label: 'Yes' }], correctOptionId: 'yes' },
      },
    },
  };
  expect(buildDemoEntry('ENGLISH', bundle, { imageA: 1, imageB: 2 })).toMatchObject({
    key: 'demo',
    title: 'answer',
    imageA: 1,
    imageB: 2,
    differences: [{ id: 'd' }],
    correctOptionId: 'yes',
    hintUnits: ['a', 'n', 's', 'w', 'e', 'r'],
    hintLadder,
  });
});
