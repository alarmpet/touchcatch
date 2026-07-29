import { expect, it } from 'vitest';
import { buildDemoEntry } from './data.js';

it('maps a verified draft bundle and local assets into playable content', () => {
  const bundle = {
    publicContent: { theme: 'demo', imageA: { width: 300, height: 200 }, imageB: { width: 300, height: 200 } },
    privateSolution: {
      differences: [{ objectiveId: 'd', tier: 'NORMAL' as const, hitboxes: { imageA: { cx: .1, cy: .2, r: .03 }, imageB: { cx: .2, cy: .3, r: .04 } } }],
      finalChallenge: { canonicalAnswer: 'answer', meaning: { prompt: 'Meaning?', options: [{ id: 'yes', label: 'Yes' }], correctOptionId: 'yes' } },
    },
  };
  expect(buildDemoEntry('ENGLISH', bundle, { imageA: 1, imageB: 2 }, { width: 300, height: 200 })).toMatchObject({ key: 'demo', title: 'answer', imageA: 1, imageB: 2, sourceSize: { width: 300, height: 200 }, differences: [{ id: 'd', tier: 'NORMAL' }], correctOptionId: 'yes' });
});
