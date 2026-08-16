import { z } from 'zod';
import { canonicalJsonSha256 } from '../../../../packages/contracts/src/canonical-json.js';
import {
  attemptAssetsReadyRequestV1Schema,
  attemptCompleteRequestV1Schema,
  attemptStartRequestV1Schema,
  attemptTapRequestV1Schema,
} from '../../../../packages/contracts/src/learning-attempt.js';
import {
  assistPatternForCategory,
  newlyOpenedUnit,
  resolveTap,
} from '../../../../packages/contracts/src/learning-board.js';
import type { BearerVerifier } from '../auth/bearer.js';
import type { SubjectResolver } from '../auth/subject-resolver.js';
import type { AttemptVerifierAdapter } from '../learning/attempt-verifier.js';
import type { AttemptRuntimeRepository, PinnedAttemptHashes } from '../learning/postgres-attempt-repository.js';
import type { MobileAttemptPolicyState, MobileRuntimePolicy } from '../policy/mobile-runtime-policy.js';
import { attemptErrorResponse, errorCodeOf, jsonResponse } from './errors.js';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type AttemptHandlers = Readonly<{
  getWeeklyChallenges(request: Request): Promise<Response>;
  startAttempt(request: Request): Promise<Response>;
  attestAttemptAssets(request: Request, attemptId: string): Promise<Response>;
  tapAttempt(request: Request, attemptId: string): Promise<Response>;
  completeAttempt(request: Request, attemptId: string): Promise<Response>;
}>;

type EnabledAttemptPolicy = Extract<MobileAttemptPolicyState, { enabled: true }>;

export function createAttemptHandlers(input: Readonly<{
  verifier: BearerVerifier;
  subjectResolver: SubjectResolver;
  getPolicy(): MobileRuntimePolicy;
  repository: AttemptRuntimeRepository;
  attemptVerifier: AttemptVerifierAdapter;
  now?: () => number;
}>): AttemptHandlers {
  const now = input.now ?? (() => Date.now());

  async function principal(request: Request): Promise<string> {
    return (await input.verifier.verify(request)).authenticatedUserId;
  }
  function attemptPolicy(): EnabledAttemptPolicy | Response {
    const policy = input.getPolicy().attempts;
    return policy.enabled ? policy : jsonResponse(409, { code: policy.code });
  }
  function requireNoQuery(request: Request): void {
    if ([...new URL(request.url).searchParams].length !== 0) throw new Error('INVALID_REQUEST');
  }
  function idempotencyKey(request: Request): string {
    const key = request.headers.get('idempotency-key');
    if (!key || !uuidV4.test(key)) throw new Error('INVALID_REQUEST');
    return key.toLowerCase();
  }
  function requireAttemptId(attemptId: string): string {
    if (!uuidV4.test(attemptId)) throw new Error('INVALID_REQUEST');
    return attemptId.toLowerCase();
  }
  function pinned(policy: EnabledAttemptPolicy, contentHash: string): PinnedAttemptHashes {
    return {
      contentHash,
      rulesetHash: policy.rulesetHash,
      hintPolicyHash: policy.hintPolicyHash,
      competitionPolicyHash: policy.competitionPolicyHash,
    };
  }

  return {
    async getWeeklyChallenges(request) {
      try {
        const userId = await principal(request);
        const url = new URL(request.url);
        const queryKeys = [...url.searchParams.keys()];
        if (queryKeys.length !== 1 || queryKeys[0] !== 'seasonId') throw new Error('INVALID_REQUEST');
        const seasonId = z.uuid().parse(url.searchParams.get('seasonId'));
        const policy = attemptPolicy();
        if (policy instanceof Response) return policy;
        const subjectKey = await input.subjectResolver.ensureAndResolve(userId);
        return jsonResponse(200, await input.repository.readChallenges({ subjectKey, seasonId }));
      } catch (error) { return attemptError(error); }
    },

    async startAttempt(request) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = attemptPolicy();
        if (policy instanceof Response) return policy;
        const key = idempotencyKey(request);
        const body = attemptStartRequestV1Schema.parse(await request.json());
        const subjectKey = await input.subjectResolver.ensureAndResolve(userId);
        return jsonResponse(200, await input.repository.start({
          subjectKey,
          seasonId: body.seasonId,
          contentRevisionId: body.contentRevisionId,
          idempotencyKey: key,
          requestHash: canonicalJsonSha256(body),
          petCatalogHash: policy.catalogHash,
          ...pinned(policy, body.contentHash),
        }));
      } catch (error) { return attemptError(error); }
    },

    async attestAttemptAssets(request, attemptId) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = attemptPolicy();
        if (policy instanceof Response) return policy;
        const id = requireAttemptId(attemptId);
        idempotencyKey(request);
        const body = attemptAssetsReadyRequestV1Schema.parse(await request.json());
        const subjectKey = await input.subjectResolver.ensureAndResolve(userId);
        return jsonResponse(200, await input.repository.attestAssetsReady({
          subjectKey,
          attemptId: id,
          ...pinned(policy, body.contentHash),
        }));
      } catch (error) { return attemptError(error); }
    },

    /**
     * Resolves one tap.
     *
     * The board — hitboxes and canonical answer — is read into this process and dies here.
     * What leaves is one objective id, its display circles, and at most one revealed
     * character: exactly what the screen needs to draw a marker and fly a letter, and
     * nothing that would let a client solve the board without looking at it.
     */
    async tapAttempt(request, attemptId) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = attemptPolicy();
        if (policy instanceof Response) return policy;
        const id = requireAttemptId(attemptId);
        const key = idempotencyKey(request);
        const body = attemptTapRequestV1Schema.parse(await request.json());
        const subjectKey = await input.subjectResolver.ensureAndResolve(userId);
        const hashes = pinned(policy, body.contentHash);

        const board = await input.repository.readBoard({ subjectKey, attemptId: id, ...hashes });
        if (board.status !== 'OPEN') return jsonResponse(200, board);
        if (!board.assetsReady) throw new Error('ASSETS_NOT_READY');

        const resolved = resolveTap(
          board.objectives,
          board.claimedObjectiveIds,
          body.side,
          body.x,
          body.y,
        );
        const claimedObjectiveId = resolved.outcome === 'HIT' ? resolved.objective.objectiveId : null;
        const recorded = await input.repository.recordTap({
          subjectKey, attemptId: id, claimedObjectiveId, idempotencyKey: key, ...hashes,
        });
        if (recorded.status !== 'OPEN') return jsonResponse(200, recorded);

        // The find count is the database's, not this process's, so a lost response that the
        // client retries cannot advance the mask twice.
        const assist = assistPatternForCategory(board.category);
        const opened = recorded.outcome === 'HIT'
          ? newlyOpenedUnit(assist, board.canonicalAnswer, recorded.foundCount - 1, recorded.foundCount)
          : null;

        return jsonResponse(200, {
          attemptId: recorded.attemptId,
          status: 'OPEN' as const,
          outcome: recorded.outcome,
          objectiveId: resolved.outcome === 'MISS' ? null : resolved.objective.objectiveId,
          displayCircles: resolved.outcome === 'MISS' ? null : resolved.objective.hitboxes,
          openedUnit: opened,
          foundCount: recorded.foundCount,
          differenceCount: recorded.differenceCount,
          wrongTaps: recorded.wrongTaps,
        });
      } catch (error) { return attemptError(error); }
    },

    async completeAttempt(request, attemptId) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = attemptPolicy();
        if (policy instanceof Response) return policy;
        const id = requireAttemptId(attemptId);
        const key = idempotencyKey(request);
        const body = attemptCompleteRequestV1Schema.parse(await request.json());
        const subjectKey = await input.subjectResolver.ensureAndResolve(userId);
        const hashes = pinned(policy, body.contentHash);

        // The scoring clock has to come from the database, never from the request. Attesting
        // first is idempotent: it returns the assetsReadyAt already on the row, or stamps one
        // now for a client that skipped the assets-ready call — which then derives a
        // sub-500ms completion and quarantines, exactly as an unattested attempt should.
        let assetsReadyAtMs: number | null = null;
        try {
          const attested = await input.repository.attestAssetsReady({ subjectKey, attemptId: id, ...hashes });
          if (!('assetsReadyAt' in attested)) return jsonResponse(200, attested);
          assetsReadyAtMs = Date.parse(attested.assetsReadyAt);
          if (!Number.isFinite(assetsReadyAtMs)) throw new Error('DATABASE_UNAVAILABLE');
        } catch (error) {
          // A terminal attempt still has to reach commit, which replays the stored terminal
          // response for a matching completion idempotency key.
          if (errorCodeOf(error) !== 'ATTEMPT_TERMINAL') throw error;
        }

        const completedAtMs = now();
        // On the terminal replay path there is no clock to score against; commit returns the
        // stored response before it looks at any of these metrics.
        const observedReadyMs = assetsReadyAtMs ?? completedAtMs;
        const verified = input.attemptVerifier.verifyAttempt({
          startedAtMs: observedReadyMs,
          assetsReadyAtMs: observedReadyMs,
          completedAtMs,
          events: body.events,
          hintsUsed: body.hintsUsed,
          wrongTaps: body.wrongTaps,
          wrongAnswers: body.wrongAnswers,
        });

        return jsonResponse(200, await input.repository.commit({
          subjectKey,
          attemptId: id,
          idempotencyKey: key,
          requestHash: canonicalJsonSha256(body),
          displayScore: verified.displayScore,
          hintsUsed: verified.hintsUsed,
          wrongTaps: verified.wrongTaps,
          wrongAnswers: verified.wrongAnswers,
          eventDigest: canonicalJsonSha256(body.events),
          ...hashes,
        }));
      } catch (error) { return attemptError(error); }
    },
  };
}

function attemptError(error: unknown): Response {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return jsonResponse(400, { code: 'INVALID_REQUEST' });
  }
  return attemptErrorResponse(error);
}
