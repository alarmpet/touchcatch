import type { LearningDemoEntry } from './LearningDemoScreen.js';

export type Bundle = Readonly<{
  publicContent: Readonly<{ theme: string }>;
  privateSolution: Readonly<{
    differences: ReadonlyArray<Readonly<{ objectiveId: string; hitboxes: Readonly<{ imageA: Readonly<{ cx: number; cy: number; r: number }>; imageB: Readonly<{ cx: number; cy: number; r: number }> }> }>>;
    finalChallenge: Readonly<{ canonicalAnswer: string; meaning: Readonly<{ prompt: string; options: ReadonlyArray<Readonly<{ id: string; label: string }>>; correctOptionId: string }> }>;
  }>;
}>;

export function buildDemoEntry(category: LearningDemoEntry['category'], bundle: Bundle, assets: Readonly<{ imageA: unknown; imageB: unknown }>): LearningDemoEntry {
  const challenge = bundle.privateSolution.finalChallenge;
  return {
    key: bundle.publicContent.theme,
    category,
    title: challenge.canonicalAnswer,
    imageA: assets.imageA,
    imageB: assets.imageB,
    differences: bundle.privateSolution.differences.map((difference) => ({ id: difference.objectiveId, imageA: difference.hitboxes.imageA, imageB: difference.hitboxes.imageB })),
    prompt: challenge.meaning.prompt,
    options: challenge.meaning.options,
    correctOptionId: challenge.meaning.correctOptionId,
  };
}
