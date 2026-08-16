import {
  parseAttemptAssetsReadyResponseV1,
  parseAttemptCompleteResponseV1,
  parseAttemptStartResponseV1,
  parseWeeklyChallengesResponseV1,
  type AttemptAssetsReadyResponseV1,
  type AttemptCompleteResponseV1,
  type AttemptStartResponseV1,
  type WeeklyChallengesResponseV1,
} from '../../../../packages/contracts/src/learning-attempt.js';
import { z } from 'zod';
import { boardObjectiveSchema } from '../../../../packages/contracts/src/learning-board.js';
import type { MobileRpcClient } from '../database/pg-rpc.js';

/**
 * Every pinned hash is compared inside the SQL functions against the season row and the
 * challenge pin, so a drifted deployment fails closed with POLICY_MISMATCH rather than
 * writing an attempt that no longer matches the policy it was ranked under.
 */
export type PinnedAttemptHashes = Readonly<{
  contentHash: string;
  rulesetHash: string;
  hintPolicyHash: string;
  competitionPolicyHash: string;
}>;

export type StartAttemptInput = PinnedAttemptHashes & Readonly<{
  subjectKey: string;
  seasonId: string;
  contentRevisionId: string;
  idempotencyKey: string;
  requestHash: string;
  petCatalogHash: string;
}>;

export type AttestAssetsReadyInput = PinnedAttemptHashes & Readonly<{
  subjectKey: string;
  attemptId: string;
}>;

export type CommitAttemptInput = PinnedAttemptHashes & Readonly<{
  subjectKey: string;
  attemptId: string;
  idempotencyKey: string;
  requestHash: string;
  displayScore: number;
  hintsUsed: number;
  wrongTaps: number;
  wrongAnswers: number;
  eventDigest: string;
}>;

export type ReadWeeklyChallengesInput = Readonly<{
  subjectKey: string;
  seasonId: string;
}>;

export type ReadBoardInput = PinnedAttemptHashes & Readonly<{
  subjectKey: string;
  attemptId: string;
}>;

export type RecordTapInput = ReadBoardInput & Readonly<{
  /** Null for a miss. The database rejects an id that is not on this board. */
  claimedObjectiveId: string | null;
  /** Replaying this key returns the stored outcome instead of charging a second tap. */
  idempotencyKey: string;
}>;

/**
 * The answer key, read only inside the API process.
 *
 * This never becomes an HTTP response. The tap handler turns it into one objective id and
 * one revealed character; `canonicalAnswer` and the full hitbox list stay here.
 */
export const attemptBoardSchema = z.union([
  z.object({
    attemptId: z.uuid(),
    status: z.enum(['EXPIRED', 'QUARANTINED', 'COMPLETED_VERIFIED', 'ABANDONED']),
  }).strict(),
  z.object({
    attemptId: z.uuid(),
    status: z.literal('OPEN'),
    category: z.enum(['ENGLISH', 'PROVERB']),
    assetsReady: z.boolean(),
    canonicalAnswer: z.string().min(1),
    objectives: z.array(boardObjectiveSchema).min(1),
    claimedObjectiveIds: z.array(z.string()),
    wrongTaps: z.number().int().nonnegative(),
  }).strict(),
]);

export const recordedTapSchema = z.union([
  z.object({
    attemptId: z.uuid(),
    status: z.enum(['EXPIRED', 'QUARANTINED', 'COMPLETED_VERIFIED', 'ABANDONED']),
  }).strict(),
  z.object({
    attemptId: z.uuid(),
    status: z.literal('OPEN'),
    outcome: z.enum(['HIT', 'MISS', 'DUPLICATE']),
    objectiveId: z.string().nullable(),
    foundCount: z.number().int().nonnegative(),
    differenceCount: z.number().int().positive(),
    wrongTaps: z.number().int().nonnegative(),
  }).strict(),
]);

export type AttemptBoard = z.infer<typeof attemptBoardSchema>;
export type RecordedTap = z.infer<typeof recordedTapSchema>;

export interface AttemptRuntimeRepository {
  start(input: StartAttemptInput): Promise<AttemptStartResponseV1>;
  attestAssetsReady(input: AttestAssetsReadyInput): Promise<AttemptAssetsReadyResponseV1>;
  commit(input: CommitAttemptInput): Promise<AttemptCompleteResponseV1>;
  readChallenges(input: ReadWeeklyChallengesInput): Promise<WeeklyChallengesResponseV1>;
  readBoard(input: ReadBoardInput): Promise<AttemptBoard>;
  recordTap(input: RecordTapInput): Promise<RecordedTap>;
}

export class PostgresAttemptRepository implements AttemptRuntimeRepository {
  constructor(private readonly rpc: MobileRpcClient) {}

  async start(input: StartAttemptInput): Promise<AttemptStartResponseV1> {
    return this.rpc.callParsed('start_learning_attempt_v1', [
      input.subjectKey,
      input.seasonId,
      input.contentRevisionId,
      input.idempotencyKey,
      input.requestHash,
      'RANKED',
      input.contentHash,
      input.rulesetHash,
      input.hintPolicyHash,
      input.competitionPolicyHash,
      input.petCatalogHash,
    ], parseAttemptStartResponseV1);
  }

  async attestAssetsReady(input: AttestAssetsReadyInput): Promise<AttemptAssetsReadyResponseV1> {
    return this.rpc.callParsed('attest_learning_assets_ready_owned_v1', [
      input.subjectKey,
      input.attemptId,
      input.contentHash,
      input.rulesetHash,
      input.hintPolicyHash,
      input.competitionPolicyHash,
    ], parseAttemptAssetsReadyResponseV1);
  }

  async commit(input: CommitAttemptInput): Promise<AttemptCompleteResponseV1> {
    return this.rpc.callParsed('commit_learning_attempt_owned_v1', [
      input.subjectKey,
      input.attemptId,
      input.idempotencyKey,
      input.requestHash,
      input.contentHash,
      input.rulesetHash,
      input.hintPolicyHash,
      input.competitionPolicyHash,
      input.displayScore,
      input.hintsUsed,
      input.wrongTaps,
      input.wrongAnswers,
      input.eventDigest,
    ], parseAttemptCompleteResponseV1);
  }

  async readChallenges(input: ReadWeeklyChallengesInput): Promise<WeeklyChallengesResponseV1> {
    return this.rpc.callParsed('read_weekly_challenges_v1', [
      input.subjectKey,
      input.seasonId,
    ], parseWeeklyChallengesResponseV1);
  }

  async readBoard(input: ReadBoardInput): Promise<AttemptBoard> {
    return this.rpc.callParsed('read_learning_attempt_board_v1', [
      input.subjectKey,
      input.attemptId,
      input.contentHash,
      input.rulesetHash,
      input.hintPolicyHash,
      input.competitionPolicyHash,
    ], (value) => attemptBoardSchema.parse(value));
  }

  async recordTap(input: RecordTapInput): Promise<RecordedTap> {
    return this.rpc.callParsed('record_learning_tap_v1', [
      input.subjectKey,
      input.attemptId,
      input.contentHash,
      input.rulesetHash,
      input.hintPolicyHash,
      input.competitionPolicyHash,
      input.claimedObjectiveId,
      input.idempotencyKey,
    ], (value) => recordedTapSchema.parse(value));
  }
}
