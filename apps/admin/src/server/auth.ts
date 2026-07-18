type AuthRequest = Readonly<{ authorization: string | null; sessionId: string | null }>;
type AuthOptions = Readonly<{
  authOrigin: string;
  publishableKey: string;
  fetcher: typeof fetch;
}>;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function authenticateAdmin(request: AuthRequest, options: AuthOptions) {
  if (!request.authorization?.startsWith('Bearer ') || request.authorization.length <= 7 || !request.sessionId) throw new Error('UNAUTHORIZED');
  const response = await options.fetcher(`${options.authOrigin}/auth/v1/user`, {
    headers: { authorization: request.authorization, apikey: options.publishableKey },
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('UNAUTHORIZED');
  const value: unknown = await response.json();
  if (!object(value) || typeof value.id !== 'string' || !object(value.app_metadata)) throw new Error('UNAUTHORIZED');
  const roles = value.app_metadata.roles;
  if (!Array.isArray(roles) || !roles.every((role) => typeof role === 'string') || !roles.includes('CONTENT_PUBLISHER')) throw new Error('FORBIDDEN');
  return { actorId: value.id, sessionId: request.sessionId, roles: Object.freeze([...roles]) };
}

export type VerifiedAdminSession = Readonly<{ actorId: string; sessionId: string; roles: readonly string[] }>;
export type AdminRequestProof = Readonly<{ authorization: string | null; origin: string | null; csrfCookie: string | null; csrfHeader: string | null }>;

export function createVerifiedAuthAdapter(dependencies: Readonly<{
  verifyToken(token: string): Promise<Readonly<{ actorId: string; tokenId: string }>>;
  loadSession(tokenId: string): Promise<VerifiedAdminSession | null>;
}>) {
  return { async authenticate(request: AdminRequestProof, allowedOrigin: string): Promise<VerifiedAdminSession> {
    if (request.origin !== allowedOrigin) throw new Error('ORIGIN_MISMATCH');
    if (!request.csrfCookie || request.csrfCookie !== request.csrfHeader) throw new Error('CSRF_MISMATCH');
    const match = /^Bearer ([A-Za-z0-9._~-]{8,4096})$/u.exec(request.authorization ?? '');
    if (!match) throw new Error('UNAUTHORIZED');
    const verified = await dependencies.verifyToken(match[1]!);
    const session = await dependencies.loadSession(verified.tokenId);
    if (!session || session.actorId !== verified.actorId) throw new Error('UNAUTHORIZED');
    if (!session.roles.includes('CONTENT_PUBLISHER')) throw new Error('FORBIDDEN');
    return session;
  } };
}
import 'server-only';
