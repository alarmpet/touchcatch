import type { LearningDemoEntry } from './LearningDemoScreen';

type Point = readonly [number, number];

function differences(points: readonly Point[]) {
  return points.map(([cx, cy], index) => ({
    id: `preview-difference-${index + 1}`,
    imageA: { cx, cy, r: 0.06 },
    imageB: { cx, cy, r: 0.06 },
  }));
}

/** Casual, non-ranked preview content. It contains no production revision or private-solution metadata. */
export const learningPreviewEntries: readonly LearningDemoEntry[] = [
  {
    key: 'preview-en-resilience', category: 'ENGLISH', preferredInputSurface: 'FREE_TEXT', assistPattern: 'SPELLING', title: 'resilience',
    imageA: require('../../../../content/learning/source/en-resilience-a.png'), imageB: require('../../../../content/learning/source/en-resilience-b.png'),
    differences: differences([[0.427, 0.63], [0.144, 0.683], [0.12, 0.844], [0.599, 0.703], [0.253, 0.57], [0.816, 0.464], [0.829, 0.102], [0.631, 0.436], [0.246, 0.422], [0.261, 0.771]]),
    prompt: '회복탄력성을 뜻하는 영어 단어는?', options: [{ id: 'correct', label: 'resilience' }], correctOptionId: 'correct', hintUnits: [...'resilience'],
  },
  {
    key: 'preview-ko-proverb', category: 'PROVERB', preferredInputSurface: 'FREE_TEXT', assistPattern: 'INITIAL_PATTERN', title: '백문이 불여일견',
    imageA: require('../../../../content/learning/source/ko-proverb-seeing-is-believing-a.png'), imageB: require('../../../../content/learning/source/ko-proverb-seeing-is-believing-b.png'),
    differences: differences([[0.578, 0.683], [0.383, 0.497], [0.373, 0.718], [0.233, 0.177], [0.736, 0.848], [0.426, 0.083], [0.239, 0.297], [0.905, 0.225], [0.904, 0.35], [0.258, 0.419]]),
    prompt: '직접 보는 것이 더 낫다는 속담은?', options: [{ id: 'correct', label: '백문이 불여일견' }], correctOptionId: 'correct', hintUnits: [...'백문이 불여일견'],
  },
  {
    key: 'preview-ko-idiom', category: 'IDIOM', preferredInputSurface: 'FREE_TEXT', assistPattern: 'INITIAL_PATTERN', title: '전화위복',
    imageA: require('../../../../content/learning/source/ko-idiom-turn-misfortune-a.png'), imageB: require('../../../../content/learning/source/ko-idiom-turn-misfortune-b.png'),
    differences: differences([[0.089, 0.705], [0.794, 0.785], [0.43, 0.247], [0.445, 0.608], [0.718, 0.712], [0.836, 0.15], [0.948, 0.283], [0.691, 0.389], [0.229, 0.127], [0.54, 0.098]]),
    prompt: '나쁜 일이 좋은 결과로 바뀐다는 사자성어는?', options: [{ id: 'correct', label: '전화위복' }], correctOptionId: 'correct', hintUnits: [...'전화위복'],
  },
];
