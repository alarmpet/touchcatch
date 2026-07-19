import { authorize } from '../auth/gate.js';
import type { VerifiedIdentity } from '../auth/verify.js';

type Dependencies = Readonly<{
  verifyAccessToken(token: string): Promise<VerifiedIdentity>;
  ensureAccount(authSub: string): Promise<boolean>;
  readMe(authSub: string): Promise<Readonly<{ profile: Readonly<{ displayName: string }>; points: number }>>;
}>;

const json = (status: number, body: unknown) => Response.json(body, { status });

export function createHttpRouter(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.pathname !== '/v1/me') return json(404, { code: 'NOT_FOUND' });
    const match = /^Bearer ([A-Za-z0-9._~-]{8,4096})$/u.exec(request.headers.get('authorization') ?? '');
    if (!match) return json(401, { code: 'UNAUTHORIZED' });
    let identity: VerifiedIdentity;
    try { identity = await dependencies.verifyAccessToken(match[1]!); } catch { return json(401, { code: 'UNAUTHORIZED' }); }
    if (identity.isAnonymous) return json(403, { code: 'ANONYMOUS_FORBIDDEN' });
    let accountReady = false;
    try { accountReady = await dependencies.ensureAccount(identity.authSub); } catch { /* typed below */ }
    const decision = authorize({ ...identity, accountReady });
    if (!decision.ok) return json(decision.status, { code: decision.code });
    return json(200, await dependencies.readMe(decision.authSub));
  };
}
