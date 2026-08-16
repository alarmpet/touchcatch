import { VerifiedAttemptResult } from '@spot-learn/learning-competition';
import type { SqlRpcClient } from './sql-rpc-client.js';

export type CommitAttemptParams = {
  attemptId: string;
  subjectKey: string;
  seasonId: string;
  category: string;
  contentRevisionId: string;
  selectedUserPetId: string;
  verifiedResult: VerifiedAttemptResult;
};

export class AttemptRepository {
  private readonly bestRecords = new Map<string, VerifiedAttemptResult>();

  constructor(private readonly rpc?: SqlRpcClient) {}

  async commitAttempt(params: CommitAttemptParams): Promise<{ committed: boolean; isBestRecord: boolean }> {
    if (this.rpc) {
      return this.rpc.call('private.commit_learning_attempt_v1', {
        attempt_id: params.attemptId,
        subject_key: params.subjectKey,
        season_id: params.seasonId,
        category: params.category,
        content_revision_id: params.contentRevisionId,
        selected_user_pet_id: params.selectedUserPetId,
        verified_result: params.verifiedResult,
      });
    }
    if (params.verifiedResult.verificationStatus === 'QUARANTINED') {
      return { committed: true, isBestRecord: false };
    }
    const key = `${params.subjectKey}:${params.seasonId}:${params.contentRevisionId}`;
    const incumbent = this.bestRecords.get(key);
    const isBestRecord = !incumbent || isBetterVerifiedResult(params.verifiedResult, incumbent);
    if (isBestRecord) this.bestRecords.set(key, params.verifiedResult);
    return { committed: true, isBestRecord };
  }
}

function isBetterVerifiedResult(candidate: VerifiedAttemptResult, incumbent: VerifiedAttemptResult): boolean {
  const candidateTuple = [candidate.displayScore, -candidate.hintsUsed, -candidate.wrongAnswers, -candidate.wrongTaps, -candidate.completionMs];
  const incumbentTuple = [incumbent.displayScore, -incumbent.hintsUsed, -incumbent.wrongAnswers, -incumbent.wrongTaps, -incumbent.completionMs];
  for (let index = 0; index < candidateTuple.length; index += 1) {
    if (candidateTuple[index] === incumbentTuple[index]) continue;
    return candidateTuple[index]! > incumbentTuple[index]!;
  }
  return false;
}
