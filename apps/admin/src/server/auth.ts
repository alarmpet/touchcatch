export type VerifiedAdminSession = Readonly<{ actorId: string; sessionId: string; roles: readonly string[] }>;
export type AdminRequestProof = Readonly<{ authorization: string | null; origin: string | null; csrfCookie: string | null; csrfHeader: string | null }>;

export function createCookieSessionAuth(dependencies: Readonly<{ hashSession(value: string): string; loadSession(hash: string): Promise<VerifiedAdminSession | null> }>) {
  return { async authenticate(input: Readonly<{ sessionId: string | null; origin: string | null; allowedOrigin: string; csrfCookie: string | null; csrfHeader: string | null }>) {
    if (input.origin !== input.allowedOrigin) throw new Error('ORIGIN_MISMATCH');
    if (!input.csrfCookie || input.csrfCookie !== input.csrfHeader) throw new Error('CSRF_MISMATCH');
    if (!input.sessionId) throw new Error('UNAUTHORIZED');
    const session = await dependencies.loadSession(dependencies.hashSession(input.sessionId));
    if (!session) throw new Error('UNAUTHORIZED');
    if (!session.roles.includes('CONTENT_PUBLISHER')) throw new Error('FORBIDDEN');
    return session;
  } };
}

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
