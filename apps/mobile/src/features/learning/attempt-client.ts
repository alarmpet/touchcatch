import {
  attemptCompleteRequestV1Schema,
  parseAttemptAssetsReadyResponseV1,
  parseAttemptCompleteResponseV1,
  parseAttemptStartResponseV1,
  parseAttemptTapResponseV1,
  parseWeeklyChallengesResponseV1,
  type AttemptAssetsReadyResponseV1,
  type AttemptCommandEventV1,
  type AttemptCompleteResponseV1,
  type AttemptStartResponseV1,
  type AttemptTapResponseV1,
  type WeeklyChallengesResponseV1,
} from '../../../../../packages/contracts/src/learning-attempt';

export type AttemptClientRequest = Readonly<{
  method: 'GET' | 'POST';
  path: string;
  idempotencyKey?: string;
  body?: unknown;
}>;

export type AttemptClientTransport = Readonly<{
  request<T>(request: AttemptClientRequest): Promise<T>;
}>;

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha256Hex = /^[0-9a-f]{64}$/u;

function requireIdempotencyKey(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  if (!uuidV4.test(normalized)) throw new Error('IDEMPOTENCY_KEY_INVALID');
  return normalized;
}

function requireUuid(value: string, code: string): string {
  const normalized = value.trim().toLowerCase();
  if (!uuidV4.test(normalized)) throw new Error(code);
  return normalized;
}

function requireAttemptId(value: string): string {
  return requireUuid(value, 'ATTEMPT_ID_INVALID');
}

function requireContentHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!sha256Hex.test(normalized)) throw new Error('CONTENT_HASH_INVALID');
  return normalized;
}

/**
 * The client never sends a clock. `startedAt`, `assetsReadyAt` and `completionMs` all come
 * back from the server, so a tampered device can shift its own display but not its rank.
 */
export function createAttemptClient(transport: AttemptClientTransport) {
  return {
    /** The pinned board for the season. Carries public art only — never a hitbox. */
    getChallenges: async (seasonId: string): Promise<WeeklyChallengesResponseV1> => {
      const value = await transport.request<unknown>({
        method: 'GET',
        path: `/v1/learning/challenges?seasonId=${encodeURIComponent(requireUuid(seasonId, 'ATTEMPT_SEASON_INVALID'))}`,
      });
      try {
        return parseWeeklyChallengesResponseV1(value);
      } catch {
        throw new Error('WEEKLY_CHALLENGES_RESPONSE_INVALID');
      }
    },

    start: async (input: Readonly<{
      seasonId: string;
      contentRevisionId: string;
      contentHash: string;
      idempotencyKey: string;
    }>): Promise<AttemptStartResponseV1> => {
      const value = await transport.request<unknown>({
        method: 'POST',
        path: '/v1/learning/attempts',
        idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
        body: {
          seasonId: requireUuid(input.seasonId, 'ATTEMPT_SEASON_INVALID'),
          contentRevisionId: requireUuid(input.contentRevisionId, 'ATTEMPT_CONTENT_REVISION_INVALID'),
          contentHash: requireContentHash(input.contentHash),
        },
      });
      try {
        return parseAttemptStartResponseV1(value);
      } catch {
        throw new Error('ATTEMPT_START_RESPONSE_INVALID');
      }
    },

    /** Call once both images have decoded — this is what starts the scoring clock. */
    markAssetsReady: async (input: Readonly<{
      attemptId: string;
      contentHash: string;
      idempotencyKey: string;
    }>): Promise<AttemptAssetsReadyResponseV1> => {
      const value = await transport.request<unknown>({
        method: 'POST',
        path: `/v1/learning/attempts/${requireAttemptId(input.attemptId)}/assets-ready`,
        idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
        body: { contentHash: requireContentHash(input.contentHash) },
      });
      try {
        return parseAttemptAssetsReadyResponseV1(value);
      } catch {
        throw new Error('ATTEMPT_ASSETS_READY_RESPONSE_INVALID');
      }
    },

    /**
     * Sends one tap for the server to judge.
     *
     * The client has no hitboxes, so it cannot know whether this landed — it sends a point
     * and is told. The idempotency key matters more than it looks: without it a dropped
     * response that the player retries would be charged as a second wrong tap.
     */
    tap: async (input: Readonly<{
      attemptId: string;
      contentHash: string;
      side: 'A' | 'B';
      x: number;
      y: number;
      idempotencyKey: string;
    }>): Promise<AttemptTapResponseV1> => {
      if (!Number.isFinite(input.x) || !Number.isFinite(input.y)
        || input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1) {
        throw new Error('ATTEMPT_TAP_POINT_INVALID');
      }
      const value = await transport.request<unknown>({
        method: 'POST',
        path: `/v1/learning/attempts/${requireAttemptId(input.attemptId)}/tap`,
        idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
        body: {
          contentHash: requireContentHash(input.contentHash),
          side: input.side,
          x: input.x,
          y: input.y,
        },
      });
      try {
        return parseAttemptTapResponseV1(value);
      } catch {
        throw new Error('ATTEMPT_TAP_RESPONSE_INVALID');
      }
    },

    complete: async (input: Readonly<{
      attemptId: string;
      contentHash: string;
      events: readonly AttemptCommandEventV1[];
      hintsUsed: number;
      wrongTaps: number;
      wrongAnswers: number;
      idempotencyKey: string;
    }>): Promise<AttemptCompleteResponseV1> => {
      const body = attemptCompleteRequestV1Schema.safeParse({
        contentHash: requireContentHash(input.contentHash),
        events: input.events.map((event) => ({ ...event })),
        hintsUsed: input.hintsUsed,
        wrongTaps: input.wrongTaps,
        wrongAnswers: input.wrongAnswers,
      });
      if (!body.success) throw new Error('ATTEMPT_COMPLETE_REQUEST_INVALID');
      const value = await transport.request<unknown>({
        method: 'POST',
        path: `/v1/learning/attempts/${requireAttemptId(input.attemptId)}/complete`,
        idempotencyKey: requireIdempotencyKey(input.idempotencyKey),
        body: body.data,
      });
      try {
        return parseAttemptCompleteResponseV1(value);
      } catch {
        throw new Error('ATTEMPT_COMPLETE_RESPONSE_INVALID');
      }
    },
  } as const;
}
