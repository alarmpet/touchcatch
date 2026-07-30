import type { LearningDemoEntry } from './LearningDemoScreen';
import type { HintStepV1 } from '../../../../packages/contracts/src/content';

export type Bundle = Readonly<{
  publicContent: Readonly<{ theme: string }>;
  privateSolution: Readonly<{
    differences: ReadonlyArray<Readonly<{ objectiveId: string; hitboxes: Readonly<{ imageA: Readonly<{ cx: number; cy: number; r: number }>; imageB: Readonly<{ cx: number; cy: number; r: number }> }> }>>;
    finalChallenge: Readonly<{
      canonicalAnswer: string;
      hintUnits: readonly string[];
      hintLadder?: readonly HintStepV1[];
      meaning: Readonly<{
        prompt: string;
        options: ReadonlyArray<Readonly<{ id: string; label: string }>>;
        correctOptionId: string;
      }>;
    }>;
  }>;
}>;

export type HintAdmissionSnapshot =
  | Readonly<{
      status: 'ADMITTED';
      rankedEligible: true;
      admissionHash: string;
      hintLadder: readonly HintStepV1[];
    }>
  | Readonly<{
      status: 'MISSING' | 'REJECTED';
      rankedEligible: false;
      admissionHash: null;
    }>;

export function buildDemoEntry(
  category: LearningDemoEntry['category'],
  bundle: Bundle,
  assets: Readonly<{ imageA: unknown; imageB: unknown }>,
  admission: HintAdmissionSnapshot,
): LearningDemoEntry {
  const challenge = bundle.privateSolution.finalChallenge;
  const admitted =
    admission.status === 'ADMITTED' &&
    admission.rankedEligible &&
    /^[a-f0-9]{64}$/.test(admission.admissionHash) &&
    admission.hintLadder.length === 5;
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
    hintUnits: challenge.hintUnits,
    ...(admitted
      ? {
          hintLadder: admission.hintLadder,
          hintAdmissionHash: admission.admissionHash,
        }
      : {}),
  };
}
