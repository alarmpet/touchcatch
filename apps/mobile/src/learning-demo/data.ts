import type { ComponentProps } from 'react';
import type { Image } from 'react-native';
import type { Circle } from './controller';

export type LearningCategory = 'ENGLISH' | 'PROVERB' | 'IDIOM';
type ImageSource = ComponentProps<typeof Image>['source'];

export type LearningDemoEntry = Readonly<{
  key: string;
  category: LearningCategory;
  title: string;
  imageA: ImageSource;
  imageB: ImageSource;
  sourceSize: Readonly<{ width: number; height: number }>;
  differences: ReadonlyArray<
    Readonly<{ id: string; tier: 'NORMAL' | 'HARD'; imageA: Circle; imageB: Circle }>
  >;
  prompt: string;
  options: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  correctOptionId: string;
}>;

export type Bundle = Readonly<{
  publicContent: Readonly<{
    theme: string;
    imageA: Readonly<{ width: number; height: number }>;
    imageB: Readonly<{ width: number; height: number }>;
  }>;
  privateSolution: Readonly<{
    differences: ReadonlyArray<Readonly<{ objectiveId: string; tier: 'NORMAL' | 'HARD'; hitboxes: Readonly<{ imageA: Circle; imageB: Circle }> }>>;
    finalChallenge: Readonly<{ canonicalAnswer: string; meaning: Readonly<{ prompt: string; options: ReadonlyArray<Readonly<{ id: string; label: string }>>; correctOptionId: string }> }>;
  }>;
}>;

export function buildDemoEntry(
  category: LearningCategory,
  bundle: Bundle,
  assets: Readonly<{ imageA: ImageSource; imageB: ImageSource }>,
  sourceSize: Readonly<{ width: number; height: number }>,
): LearningDemoEntry {
  const challenge = bundle.privateSolution.finalChallenge;
  return {
    key: bundle.publicContent.theme,
    category,
    title: challenge.canonicalAnswer,
    imageA: assets.imageA,
    imageB: assets.imageB,
    sourceSize,
    differences: bundle.privateSolution.differences.map((difference) => ({ id: difference.objectiveId, tier: difference.tier, imageA: difference.hitboxes.imageA, imageB: difference.hitboxes.imageB })),
    prompt: challenge.meaning.prompt,
    options: challenge.meaning.options,
    correctOptionId: challenge.meaning.correctOptionId,
  };
}
