import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type FetchImplementation,
} from 'jose';
import {
  extractBearerToken,
  UnauthorizedError,
  type AuthenticatedPrincipal,
  type BearerVerifier,
} from './bearer.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function assertLoopbackSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Local Supabase URL must be an absolute loopback URL');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError('Local Supabase URL must be credential-free');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new TypeError('Local Supabase URL must use HTTP loopback');
  }
  return url.toString().replace(/\/$/u, '');
}

export function createLoopbackSupabaseJwtVerifier(input: Readonly<{
  supabaseUrl: string;
  fetchImpl?: FetchImplementation;
}>): BearerVerifier {
  const supabaseUrl = assertLoopbackSupabaseUrl(input.supabaseUrl);
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
  const jwks = input.fetchImpl === undefined
    ? createRemoteJWKSet(jwksUrl)
    : createRemoteJWKSet(jwksUrl, { [customFetch]: input.fetchImpl });

  return {
    async verify(request: Request): Promise<AuthenticatedPrincipal> {
      try {
        const token = extractBearerToken(request);
        const { payload } = await jwtVerify(token, jwks, {
          issuer,
          audience: 'authenticated',
          algorithms: ['ES256', 'RS256'],
          clockTolerance: 30,
        });
        if (
          typeof payload.sub !== 'string'
          || !uuidPattern.test(payload.sub)
          || payload.role !== 'authenticated'
          || payload.is_anonymous === true
        ) throw new UnauthorizedError();
        return { authenticatedUserId: payload.sub };
      } catch (error) {
        if (error instanceof UnauthorizedError) throw error;
        throw new UnauthorizedError({ cause: error });
      }
    },
  };
}
