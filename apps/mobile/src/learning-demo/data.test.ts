import { expect, it } from 'vitest';
import { buildDemoEntry } from './data.js';

it('uses only the admitted five-step hash-pinned snapshot', () => {
  const hintLadder = [1, 2, 3, 4, 5].map((ordinal) => ({
    ordinal: ordinal as 1 | 2 | 3 | 4 | 5,
    kind: 'DEFINITION' as const,
    localizedText: { ko: `제시 ${ordinal}`, en: `Hint ${ordinal}` },
    revealIndexes: [],
    rankedPenaltyUnits: 1 as const,
  }));
  const bundle = {
    publicContent: { theme: 'demo' },
    privateSolution: {
      differences: [{
        objectiveId: 'd',
        hitboxes: {
          imageA: { cx: 0.1, cy: 0.2, r: 0.03 },
          imageB: { cx: 0.2, cy: 0.3, r: 0.04 },
        },
      }],
      finalChallenge: {
        canonicalAnswer: 'answer',
        hintUnits: ['a', 'n', 's', 'w', 'e', 'r'],
        hintLadder: hintLadder.map((step) => ({
          ...step,
          localizedText: { ko: '변조됨', en: 'Mutated' },
        })),
        meaning: {
          prompt: 'Meaning?',
          options: [{ id: 'yes', label: 'Yes' }],
          correctOptionId: 'yes',
        },
      },
    },
  };

  const admitted = buildDemoEntry(
    'ENGLISH',
    bundle,
    { imageA: 1, imageB: 2 },
    {
      status: 'ADMITTED',
      rankedEligible: true,
      admissionHash: 'a'.repeat(64),
      hintLadder,
    },
  );
  expect(admitted).toMatchObject({
    key: 'demo',
    title: 'answer',
    imageA: 1,
    imageB: 2,
    differences: [{ id: 'd' }],
    correctOptionId: 'yes',
    hintUnits: ['a', 'n', 's', 'w', 'e', 'r'],
    hintLadder,
    hintAdmissionHash: 'a'.repeat(64),
  });

  expect(
    buildDemoEntry(
      'ENGLISH',
      bundle,
      { imageA: 1, imageB: 2 },
      {
        status: 'MISSING',
        rankedEligible: false,
        admissionHash: null,
      },
    ),
  ).not.toHaveProperty('hintLadder');
});
