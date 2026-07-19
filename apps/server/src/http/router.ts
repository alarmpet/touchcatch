import { authorize } from '../auth/gate.js';
import type { VerifiedIdentity } from '../auth/verify.js';

type Dependencies = Readonly<{
  verifyAccessToken(token: string): Promise<VerifiedIdentity>;
  ensureAccount(authSub: string): Promise<boolean>;
  readMe(authSub: string): Promise<Readonly<{ profile: Readonly<{ displayName: string }>; points: number }>>;
  mergeProgress?(identity: VerifiedIdentity, idempotencyKey: string, body: unknown): Promise<unknown>;
}>;

const json = (status: number, body: unknown) => Response.json(body, { status });

export function createHttpRouter(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const isMe = request.method === 'GET' && url.pathname === '/v1/me';
    const isProgressMerge = request.method === 'POST' && url.pathname === '/v1/learning/progress/merge';
    if (!isMe && !isProgressMerge) return json(404, { code: 'NOT_FOUND' });
    const match = /^Bearer ([A-Za-z0-9._~-]{8,4096})$/u.exec(request.headers.get('authorization') ?? '');
    if (!match) return json(401, { code: 'UNAUTHORIZED' });
    let identity: VerifiedIdentity;
    try { identity = await dependencies.verifyAccessToken(match[1]!); } catch { return json(401, { code: 'UNAUTHORIZED' }); }
    if (identity.isAnonymous) return json(403, { code: 'ANONYMOUS_FORBIDDEN' });
    let accountReady = false;
    try { accountReady = await dependencies.ensureAccount(identity.authSub); } catch { /* typed below */ }
    const decision = authorize({ ...identity, accountReady });
    if (!decision.ok) return json(decision.status, { code: decision.code });
    if (isMe) return json(200, await dependencies.readMe(decision.authSub));
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) return json(400, { code: 'VALIDATION_FAILED' });
    let body: unknown;
    try { body = await request.json(); } catch { return json(400, { code: 'VALIDATION_FAILED' }); }
    if (!dependencies.mergeProgress) return json(503, { code: 'ACCOUNT_SETUP_FAILED' });
    try { return json(200, await dependencies.mergeProgress(identity, idempotencyKey, body)); }
    catch (error) { return json(error instanceof Error && /IDEMPOTENCY_CONFLICT/u.test(error.message) ? 409 : 400, { code: error instanceof Error && /IDEMPOTENCY_CONFLICT/u.test(error.message) ? 'IDEMPOTENCY_CONFLICT' : 'VALIDATION_FAILED' }); }
  };
}
