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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSupabaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('SUPABASE_URL must be an absolute URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new TypeError('SUPABASE_URL must be a credential-free HTTPS URL');
  }
  return url.toString().replace(/\/$/u, '');
}

export function createSupabaseJwtVerifier(input: Readonly<{
  supabaseUrl: string;
  fetchImpl?: FetchImplementation;
}>): BearerVerifier {
  const supabaseUrl = normalizeSupabaseUrl(input.supabaseUrl);
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
