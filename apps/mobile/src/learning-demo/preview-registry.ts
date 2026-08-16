/* eslint-disable @typescript-eslint/no-require-imports -- Expo statically bundles local image assets through require(). */
import type { LearningDemoEntry } from './LearningDemoScreen';
import { generatedPreviewEntries } from './preview-registry.generated';

type Point = readonly [number, number];

function differences(points: readonly Point[]) {
  return points.map(([cx, cy], index) => ({
    id: `preview-difference-${index + 1}`,
    imageA: { cx, cy, r: 0.06 },
    imageB: { cx, cy, r: 0.06 },
  }));
}

/**
 * Word hunt targets, hand-placed against the source artwork.
 *
 * Radii stay at or above 0.06 so the tap target clears 44pt on a 390pt-wide board.
 * Only square (1:1) source images carry hunts for now: the boards render at
 * `aspectRatio: 1`, so a 3:2 source is letterboxed and normalized coordinates would
 * not land on the object the prompt names.
 */
function wordHunt(missionId: string, publicPrompt: string, cx: number, cy: number, r: number, kind: 'NORMAL' | 'SPECIAL' = 'NORMAL') {
  return { missionId, kind, publicPrompt, imageA: { cx, cy, r }, imageB: { cx, cy, r } };
}

/** Casual, non-ranked preview content. It contains no production revision or private-solution metadata. */
export const learningPreviewEntries: readonly LearningDemoEntry[] = [
  {
    key: 'preview-en-resilience', category: 'ENGLISH', preferredInputSurface: 'FREE_TEXT', assistPattern: 'SPELLING', title: 'resilience',
    imageA: require('../../../../content/learning/source/en-resilience-a.png'), imageB: require('../../../../content/learning/source/en-resilience-b.png'),
    differences: differences([[0.427, 0.63], [0.144, 0.683], [0.12, 0.844], [0.599, 0.703], [0.253, 0.57], [0.816, 0.464], [0.829, 0.102], [0.631, 0.436], [0.246, 0.422], [0.261, 0.771]]),
    // Garden scene: barrow and can sit among other tools, sunflower among many other flowers.
    wordHunts: [
      wordHunt('en-resilience-wheelbarrow', 'Wheelbarrow', 0.2, 0.72, 0.09),
      wordHunt('en-resilience-watering-can', 'Watering can', 0.298, 0.851, 0.075),
      wordHunt('en-resilience-sunflower', 'Sunflower', 0.664, 0.469, 0.065, 'SPECIAL'),
    ],
    prompt: '회복탄력성을 뜻하는 영어 단어는?', options: [{ id: 'correct', label: 'resilience' }], correctOptionId: 'correct', hintUnits: [...'resilience'],
  },
  {
    key: 'preview-ko-proverb', category: 'PROVERB', preferredInputSurface: 'FREE_TEXT', assistPattern: 'INITIAL_PATTERN', title: '백문이 불여일견',
    imageA: require('../../../../content/learning/source/ko-proverb-seeing-is-believing-a.png'), imageB: require('../../../../content/learning/source/ko-proverb-seeing-is-believing-b.png'),
    differences: differences([[0.578, 0.683], [0.383, 0.497], [0.373, 0.718], [0.233, 0.177], [0.736, 0.848], [0.426, 0.083], [0.239, 0.297], [0.905, 0.225], [0.904, 0.35], [0.258, 0.419]]),
    // Optics classroom: prism and mirror sit among flasks and lenses, rainbow spans the desk.
    wordHunts: [
      wordHunt('ko-proverb-prism', '프리즘', 0.561, 0.664, 0.07),
      wordHunt('ko-proverb-mirror', '거울', 0.903, 0.796, 0.06),
      wordHunt('ko-proverb-rainbow', '무지개', 0.8, 0.674, 0.07, 'SPECIAL'),
    ],
    prompt: '직접 보는 것이 더 낫다는 속담은?', options: [{ id: 'correct', label: '백문이 불여일견' }], correctOptionId: 'correct', hintUnits: [...'백문이 불여일견'],
  },
  {
    key: 'preview-ko-idiom', category: 'IDIOM', preferredInputSurface: 'FREE_TEXT', assistPattern: 'INITIAL_PATTERN', title: '전화위복',
    imageA: require('../../../../content/learning/source/ko-idiom-turn-misfortune-a.png'), imageB: require('../../../../content/learning/source/ko-idiom-turn-misfortune-b.png'),
    differences: differences([[0.089, 0.705], [0.794, 0.785], [0.43, 0.247], [0.445, 0.608], [0.718, 0.712], [0.836, 0.15], [0.948, 0.283], [0.691, 0.389], [0.229, 0.127], [0.54, 0.098]]),
    aspectRatio: 1536 / 1024,
    // Rainy-day art show: umbrellas by the door, step ladder on stage, trophy on its pedestal.
    wordHunts: [
      wordHunt('ko-idiom-umbrella', '우산', 0.094, 0.723, 0.08),
      wordHunt('ko-idiom-ladder', '사다리', 0.456, 0.488, 0.065),
      wordHunt('ko-idiom-trophy', '트로피', 0.682, 0.4, 0.062, 'SPECIAL'),
    ],
    prompt: '나쁜 일이 좋은 결과로 바뀐다는 사자성어는?', options: [{ id: 'correct', label: '전화위복' }], correctOptionId: 'correct', hintUnits: [...'전화위복'],
  },
  /**
   * Every admitted pack, projected to preview-safe fields.
   *
   * The hand-authored packs above stay first and stay separate: their word hunts are
   * hand-placed against the artwork, which the drafts do not carry. These add the breadth
   * the daily board needs — three packs meant it repeated every third day.
   */
  ...generatedPreviewEntries,
];
