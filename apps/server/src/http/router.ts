import { authorize } from '../auth/gate.js';
import type { VerifiedIdentity } from '../auth/verify.js';

export const GET_ME_ERROR_CODES_BY_STATUS = {
  401: ['UNAUTHORIZED'],
  403: ['ANONYMOUS_FORBIDDEN', 'ACCOUNT_DELETING'],
  503: ['ACCOUNT_SETUP_FAILED'],
} as const;

type Dependencies = Readonly<{
  verifyAccessToken(token: string): Promise<VerifiedIdentity>;
  ensureAccount(authSub: string): Promise<boolean>;
  readMe(authSub: string): Promise<Readonly<{ profile: Readonly<{ displayName: string }>; points: number }>>;
  mergeProgress?(identity: VerifiedIdentity, idempotencyKey: string, body: unknown): Promise<unknown>;
  updateProfile?(identity: VerifiedIdentity, idempotencyKey: string, body: unknown): Promise<unknown>;
  requestAccountDeletion?(identity: VerifiedIdentity, idempotencyKey: string): Promise<unknown>;
}>;

const json = (status: number, body: unknown) => Response.json(body, { status });
function lifecycleError(error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  if (/ACCOUNT_DELETING/u.test(code)) return json(403, { code: GET_ME_ERROR_CODES_BY_STATUS[403][1] });
  if (/RATE_LIMITED/u.test(code)) return json(429, { code: 'RATE_LIMITED' });
  if (/IDEMPOTENCY_CONFLICT/u.test(code)) return json(409, { code: 'IDEMPOTENCY_CONFLICT' });
  return json(400, { code: 'VALIDATION_FAILED' });
}

export function createHttpRouter(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const isMe = request.method === 'GET' && url.pathname === '/v1/me';
    const isMePatch = request.method === 'PATCH' && url.pathname === '/v1/me';
    const isMeDelete = request.method === 'DELETE' && url.pathname === '/v1/me';
    const isProgressMerge = request.method === 'POST' && url.pathname === '/v1/learning/progress/merge';
    if (!isMe && !isMePatch && !isMeDelete && !isProgressMerge) return json(404, { code: 'NOT_FOUND' });
    const match = /^Bearer ([A-Za-z0-9._~-]{8,4096})$/u.exec(request.headers.get('authorization') ?? '');
    if (!match) return json(401, { code: GET_ME_ERROR_CODES_BY_STATUS[401][0] });
    let identity: VerifiedIdentity;
    try { identity = await dependencies.verifyAccessToken(match[1]!); } catch { return json(401, { code: GET_ME_ERROR_CODES_BY_STATUS[401][0] }); }
    if (identity.isAnonymous) return json(403, { code: GET_ME_ERROR_CODES_BY_STATUS[403][0] });
    if (isMeDelete) {
      const idempotencyKey = request.headers.get('idempotency-key');
      if (!idempotencyKey || !dependencies.requestAccountDeletion) return json(400, { code: 'VALIDATION_FAILED' });
      try { return json(202, await dependencies.requestAccountDeletion(identity, idempotencyKey)); }
      catch (error) { return lifecycleError(error); }
    }
    let accountReady = false;
    try { accountReady = await dependencies.ensureAccount(identity.authSub); } catch (error) { if (error instanceof Error && /ACCOUNT_DELETING/u.test(error.message)) return lifecycleError(error); }
    const decision = authorize({ ...identity, accountReady });
    if (!decision.ok) {
      if (decision.status === 401) return json(401, { code: GET_ME_ERROR_CODES_BY_STATUS[401][0] });
      if (decision.status === 403) return json(403, { code: GET_ME_ERROR_CODES_BY_STATUS[403][0] });
      return json(503, { code: GET_ME_ERROR_CODES_BY_STATUS[503][0] });
    }
    if (isMe) { try { return json(200, await dependencies.readMe(decision.authSub)); } catch (error) { return lifecycleError(error); } }
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) return json(400, { code: 'VALIDATION_FAILED' });
    let body: unknown;
    try { body = await request.json(); } catch { return json(400, { code: 'VALIDATION_FAILED' }); }
    const handler = isMePatch ? dependencies.updateProfile : dependencies.mergeProgress;
    if (!handler) return json(503, { code: GET_ME_ERROR_CODES_BY_STATUS[503][0] });
    try { return json(200, await handler(identity, idempotencyKey, body)); }
    catch (error) { return lifecycleError(error); }
  };
}
