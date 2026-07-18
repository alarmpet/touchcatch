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
