import { z } from 'zod';
import { canonicalJsonSha256 } from '../../../../packages/contracts/src/canonical-json.js';
import type { BearerVerifier } from '../auth/bearer.js';
import type { SubjectResolver } from '../auth/subject-resolver.js';
import type { MobileRuntimePolicy } from '../policy/mobile-runtime-policy.js';
import { DAILY_DRAW_PROBABILITIES_V1, kstClaimDateV1 } from '../pets/daily-draw.js';
import type { PetRuntimeRepository } from '../pets/postgres-pet-repository.js';
import type { AttemptHandlers } from './attempt-handlers.js';
import { jsonResponse, petErrorResponse } from './errors.js';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const promotionBody = z.object({
  materials: z.tuple([z.object({ petId: z.uuid(), count: z.literal(10) }).strict()]),
}).strict();

export type PetHandlers = Readonly<{
  getPetCollection(request: Request): Promise<Response>;
  claimDailyDraw(request: Request): Promise<Response>;
  promoteDuplicates(request: Request): Promise<Response>;
}>;
export type MobileApiHandlers = PetHandlers & AttemptHandlers & Readonly<{
  getMe(request: Request): Promise<Response>;
  deleteMe(request: Request): Promise<Response>;
  readDeletionStatus(request: Request): Promise<Response>;
  getWeeklyLeaderboard(request: Request): Promise<Response>;
}>;

export function createMobileApiHandlers(
  pets: PetHandlers,
  getMe: (request: Request) => Promise<Response>,
  getWeeklyLeaderboard: (request: Request) => Promise<Response>,
  attempts: AttemptHandlers,
  deletion: Readonly<{
    deleteMe(request: Request): Promise<Response>;
    readDeletionStatus(request: Request): Promise<Response>;
  }>,
): MobileApiHandlers {
  return { ...pets, ...attempts, getMe, getWeeklyLeaderboard, ...deletion };
}

export function createPetHandlers(input: Readonly<{
  verifier: BearerVerifier;
  subjectResolver: SubjectResolver;
  getPolicy(): MobileRuntimePolicy;
  repository: PetRuntimeRepository;
  now?: () => Date;
}>): PetHandlers {
  async function principal(request: Request): Promise<string> {
    return (await input.verifier.verify(request)).authenticatedUserId;
  }
  function rewardPolicy(): Extract<MobileRuntimePolicy['rewards'], { enabled: true }> | Response {
    const policy = input.getPolicy().rewards;
    return policy.enabled ? policy : jsonResponse(409, { code: policy.code });
  }
  async function resolve(userId: string): Promise<string> { return input.subjectResolver.ensureAndResolve(userId); }
  function idempotencyKey(request: Request): string {
    const key = request.headers.get('idempotency-key');
    if (!key || !uuidV4.test(key)) throw new Error('INVALID_REQUEST');
    return key;
  }
  function requireNoQuery(request: Request): void {
    if ([...new URL(request.url).searchParams].length !== 0) throw new Error('INVALID_REQUEST');
  }
  async function requireEmptyBody(request: Request): Promise<void> {
    if ((await request.text()).trim() !== '') throw new Error('INVALID_REQUEST');
  }

  return {
    async getPetCollection(request) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = rewardPolicy();
        if (policy instanceof Response) return policy;
        const subjectKey = await resolve(userId);
        return jsonResponse(200, await input.repository.readCollection({ subjectKey, catalogRevision: policy.catalogRevision, catalogHash: policy.catalogHash }));
      } catch (error) { return petErrorResponse(error); }
    },
    async claimDailyDraw(request) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = rewardPolicy();
        if (policy instanceof Response) return policy;
        idempotencyKey(request);
        await requireEmptyBody(request);
        const subjectKey = await resolve(userId);
        return jsonResponse(200, await input.repository.claimEffectOnce({ subjectKey, claimDate: kstClaimDateV1(input.now?.()), seriesId: 'DAILY_FREE_DRAW_V1', probabilities: DAILY_DRAW_PROBABILITIES_V1, emptyTierResolution: 'STEP_DOWN_TO_NEAREST_POPULATED', economyVersion: policy.economyVersion, economyHash: policy.economyHash, catalogRevision: policy.catalogRevision, catalogHash: policy.catalogHash }));
      } catch (error) { return petErrorResponse(error); }
    },
    async promoteDuplicates(request) {
      try {
        const userId = await principal(request);
        requireNoQuery(request);
        const policy = rewardPolicy();
        if (policy instanceof Response) return policy;
        const key = idempotencyKey(request);
        const body = promotionBody.parse(await request.json());
        const accepted = { materials: body.materials };
        const subjectKey = await resolve(userId);
        return jsonResponse(200, await input.repository.promoteEffectOnce({ subjectKey, idempotencyKey: key, requestHash: canonicalJsonSha256(accepted), sourcePetId: body.materials[0].petId, consumedCopies: 10, economyVersion: policy.economyVersion, economyHash: policy.economyHash, catalogRevision: policy.catalogRevision, catalogHash: policy.catalogHash }));
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return jsonResponse(400, { code: 'INVALID_MATERIALS' });
        return petErrorResponse(error);
      }
    },
  };
}
