import { z } from 'zod';

/**
 * Ranked attempt submission contract.
 *
 * The database owns every clock in this flow: `start_learning_attempt_v1` issues
 * `startedAt`/`expiresAt`, `attest_learning_assets_ready_v1` issues `assetsReadyAt`, and
 * `commit_learning_attempt_v1` derives `completionMs` from `assetsReadyAt` to its own
 * `clock_timestamp()`. Nothing here lets a client state a time that reaches a stored column,
 * so the request schemas deliberately carry no wall-clock fields.
 */

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/u, 'expected lowercase sha256 hex');

export const attemptVerificationStatusV1Schema = z.enum([
  'OPEN',
  'COMPLETED_VERIFIED',
  'ABANDONED',
  'EXPIRED',
  'QUARANTINED',
]);

export const attemptStartRequestV1Schema = z.object({
  seasonId: z.uuid(),
  contentRevisionId: z.uuid(),
  contentHash: sha256HexSchema,
}).strict();

export const attemptAssetsReadyRequestV1Schema = z.object({
  contentHash: sha256HexSchema,
}).strict();

/**
 * Event timestamps are client-relative and never become a stored clock; they exist so the
 * digest pins one ordered command log per attempt. Non-decreasing order is required because
 * a log that moves backwards cannot be a real replay of the session.
 */
export const attemptCommandEventV1Schema = z.object({
  type: z.string().trim().min(1).max(64),
  timestampMs: z.number().int().nonnegative().max(86_400_000),
  payload: z.unknown().optional(),
}).strict();

export const attemptCompleteRequestV1Schema = z.object({
  contentHash: sha256HexSchema,
  events: z.array(attemptCommandEventV1Schema).max(500).refine(
    (events) => events.every((event, index) => index === 0 || event.timestampMs >= events[index - 1]!.timestampMs),
    'attempt events must be ordered by non-decreasing timestampMs',
  ),
  hintsUsed: z.number().int().min(0).max(5),
  wrongTaps: z.number().int().min(0).max(500),
  wrongAnswers: z.number().int().min(0).max(500),
}).strict();

/**
 * One tap, resolved by the server.
 *
 * Coordinates are fractions of the board so they survive any screen size, and they are the
 * only thing the client is trusted to state: the server owns whether that point hit
 * anything, which difference it was, and what the find opened.
 */
export const attemptTapRequestV1Schema = z.object({
  contentHash: sha256HexSchema,
  side: z.enum(['A', 'B']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
}).strict();

const tapCircleSchema = z.object({
  cx: z.number().min(0).max(1),
  cy: z.number().min(0).max(1),
  r: z.number().gt(0).max(1),
}).strict();

export const attemptTapResponseV1Schema = z.union([
  z.object({
    attemptId: z.uuid(),
    status: z.enum(['EXPIRED', 'QUARANTINED', 'COMPLETED_VERIFIED', 'ABANDONED']),
  }).strict(),
  z.object({
    attemptId: z.uuid(),
    status: z.literal('OPEN'),
    outcome: z.enum(['HIT', 'MISS', 'DUPLICATE']),
    /** Present on HIT and DUPLICATE, so the board can mark what was found on both sides. */
    objectiveId: z.string().min(1).max(64).nullable(),
    displayCircles: z.object({ imageA: tapCircleSchema, imageB: tapCircleSchema }).strict().nullable(),
    /** The single answer unit this find paid for — what the letter flight carries. */
    openedUnit: z.object({
      index: z.number().int().min(0).max(63),
      text: z.string().min(1).max(8),
    }).strict().nullable(),
    foundCount: z.number().int().min(0).max(20),
    differenceCount: z.number().int().min(1).max(20),
    wrongTaps: z.number().int().min(0),
  }).strict(),
]);

export const attemptStartResponseV1Schema = z.object({
  attemptId: z.uuid(),
  status: attemptVerificationStatusV1Schema,
  startedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  contentRevisionId: z.uuid(),
}).strict();

export const attemptAssetsReadyResponseV1Schema = z.union([
  z.object({
    attemptId: z.uuid(),
    status: z.literal('EXPIRED'),
  }).strict(),
  z.object({
    attemptId: z.uuid(),
    status: attemptVerificationStatusV1Schema,
    assetsReadyAt: z.iso.datetime({ offset: true }),
  }).strict(),
]);

export const attemptCompleteResponseV1Schema = z.union([
  z.object({
    attemptId: z.uuid(),
    status: z.literal('EXPIRED'),
  }).strict(),
  z.object({
    attemptId: z.uuid(),
    status: z.literal('QUARANTINED'),
    completionMs: z.number().int().nonnegative().nullable(),
    bestChanged: z.literal(false),
  }).strict(),
  z.object({
    attemptId: z.uuid(),
    status: z.literal('COMPLETED_VERIFIED'),
    completionMs: z.number().int().nonnegative(),
    acceptedAt: z.iso.datetime({ offset: true }),
    bestChanged: z.boolean(),
  }).strict(),
]);

/**
 * The pinned board for one season. Carries the public half of each revision only — the
 * hitboxes and the canonical answer live in `private.game_content_solutions` and never
 * cross this boundary, which is what lets the client render a ranked puzzle it cannot solve
 * by reading its own payload.
 */
const publicImageV1Schema = z.object({
  url: z.string().min(1).max(2048),
  sha256: sha256HexSchema,
  encodedBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mimeType: z.enum(['image/png', 'image/webp', 'image/jpeg']),
}).strict();

export const weeklyChallengeV1Schema = z.object({
  category: z.enum(['ENGLISH', 'PROVERB']),
  ordinal: z.number().int().min(1).max(5),
  contentRevisionId: z.uuid(),
  contentHash: sha256HexSchema,
  imageA: publicImageV1Schema,
  imageB: publicImageV1Schema,
  /** How many differences the board holds, so the client can draw "0 / N". */
  differenceCount: z.number().int().min(1).max(20),
  assistPattern: z.enum(['SPELLING', 'INITIAL_PATTERN', 'NONE']),
  /**
   * The empty answer slots. Length and word gaps only — the same thing hint ladder step
   * three gives away, and the casual board already shows from the first second.
   */
  answerUnitCount: z.number().int().min(1).max(64),
  spaceIndexes: z.array(z.number().int().min(0).max(63)).max(16),
}).strict();

export const weeklyChallengesResponseV1Schema = z.object({
  seasonId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  attemptTtlSeconds: z.number().int().positive(),
  challenges: z.array(weeklyChallengeV1Schema).max(10),
}).strict();

export type PublicImageV1 = z.infer<typeof publicImageV1Schema>;
export type WeeklyChallengeV1 = z.infer<typeof weeklyChallengeV1Schema>;
export type WeeklyChallengesResponseV1 = z.infer<typeof weeklyChallengesResponseV1Schema>;

export function parseWeeklyChallengesResponseV1(input: unknown): WeeklyChallengesResponseV1 {
  return weeklyChallengesResponseV1Schema.parse(input);
}

export type AttemptVerificationStatusV1 = z.infer<typeof attemptVerificationStatusV1Schema>;
export type AttemptStartRequestV1 = z.infer<typeof attemptStartRequestV1Schema>;
export type AttemptAssetsReadyRequestV1 = z.infer<typeof attemptAssetsReadyRequestV1Schema>;
export type AttemptCommandEventV1 = z.infer<typeof attemptCommandEventV1Schema>;
export type AttemptCompleteRequestV1 = z.infer<typeof attemptCompleteRequestV1Schema>;
export type AttemptTapRequestV1 = z.infer<typeof attemptTapRequestV1Schema>;
export type AttemptTapResponseV1 = z.infer<typeof attemptTapResponseV1Schema>;

export function parseAttemptTapResponseV1(input: unknown): AttemptTapResponseV1 {
  return attemptTapResponseV1Schema.parse(input);
}
export type AttemptStartResponseV1 = z.infer<typeof attemptStartResponseV1Schema>;
export type AttemptAssetsReadyResponseV1 = z.infer<typeof attemptAssetsReadyResponseV1Schema>;
export type AttemptCompleteResponseV1 = z.infer<typeof attemptCompleteResponseV1Schema>;

export function parseAttemptStartResponseV1(input: unknown): AttemptStartResponseV1 {
  return attemptStartResponseV1Schema.parse(input);
}

export function parseAttemptAssetsReadyResponseV1(input: unknown): AttemptAssetsReadyResponseV1 {
  return attemptAssetsReadyResponseV1Schema.parse(input);
}

export function parseAttemptCompleteResponseV1(input: unknown): AttemptCompleteResponseV1 {
  return attemptCompleteResponseV1Schema.parse(input);
}
