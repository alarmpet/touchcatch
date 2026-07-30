import type { LearningDemoEntry } from './LearningDemoScreen';
import type { HintStepV1 } from '../../../../packages/contracts/src/content';

export type MobileSemanticSnapshot = Readonly<{
  key: string;
  category: LearningDemoEntry['category'];
  title: string;
  canonicalAnswer: string;
  contentRevisionId: string;
  privateSolutionHash: string;
  differences: LearningDemoEntry['differences'];
  prompt: string;
  options: LearningDemoEntry['options'];
  correctOptionId: string;
  hintUnits: readonly string[];
  hintAdmissionStatus: 'ADMITTED' | 'MISSING' | 'REJECTED';
  rankedEligible: boolean;
  hintAdmissionHash: string | null;
  hintLadder?: readonly HintStepV1[];
}>;

export function buildDemoEntry(
  snapshot: MobileSemanticSnapshot,
  assets: Readonly<{ imageA: unknown; imageB: unknown }>,
): LearningDemoEntry {
  const admitted =
    snapshot.hintAdmissionStatus === 'ADMITTED' &&
    snapshot.rankedEligible === true &&
    typeof snapshot.hintAdmissionHash === 'string' &&
    /^[a-f0-9]{64}$/.test(snapshot.hintAdmissionHash) &&
    snapshot.hintLadder?.length === 5;
  return {
    key: snapshot.key,
    category: snapshot.category,
    title: snapshot.title,
    imageA: assets.imageA,
    imageB: assets.imageB,
    differences: snapshot.differences,
    prompt: snapshot.prompt,
    options: snapshot.options,
    correctOptionId: snapshot.correctOptionId,
    hintUnits: snapshot.hintUnits,
    ...(admitted
      ? {
          hintLadder: snapshot.hintLadder,
          hintAdmissionHash: snapshot.hintAdmissionHash!,
        }
      : {}),
  };
}
