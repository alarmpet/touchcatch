import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';

export type RankedAttemptSessionInput = {
  subjectKey: string;
  seasonId: string;
  category: 'ENGLISH' | 'PROVERB';
  contentRevisionId: string;
  selectedUserPetId: string;
  rulesetHash: string;
  hintPolicyHash: string;
  competitionPolicyHash: string;
};

export type RankedAttemptSession = {
  attemptId: string;
  subjectKey: string;
  seasonId: string;
  category: string;
  contentRevisionId: string;
  selectedUserPetId: string;
  startedAtMs: number;
  status: 'OPEN';
  rankedRecord: 'BEST_COMPLETED_VERIFIED';
};

export function startRankedAttemptSession(input: RankedAttemptSessionInput, startedAtMs: number = Date.now()): RankedAttemptSession {
  const attemptSeed = `${input.subjectKey}:${input.seasonId}:${input.contentRevisionId}:${startedAtMs}`;
  const hash = canonicalJsonSha256({ seed: attemptSeed });
  const attemptId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

  return {
    attemptId,
    subjectKey: input.subjectKey,
    seasonId: input.seasonId,
    category: input.category,
    contentRevisionId: input.contentRevisionId,
    selectedUserPetId: input.selectedUserPetId,
    startedAtMs,
    status: 'OPEN',
    rankedRecord: 'BEST_COMPLETED_VERIFIED',
  };
}
