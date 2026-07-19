import { createLocalJWKSet, decodeProtectedHeader, errors, jwtVerify, type JSONWebKeySet } from 'jose';

const ALGORITHMS = ['ES256', 'RS256'] as const;

export type VerifiedIdentity = Readonly<{ authSub: string; isAnonymous: boolean }>;

type Dependencies = Readonly<{
  supabaseUrl: string;
  loadJwks(): Promise<JSONWebKeySet>;
}>;

function issuerFor(raw: string): string {
  const url = new URL(raw);
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/auth/v1`;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/u, '');
}

export function createAccessTokenVerifier(dependencies: Dependencies) {
  const issuer = issuerFor(dependencies.supabaseUrl);
  let cached: ReturnType<typeof createLocalJWKSet> | undefined;

  async function verify(token: string, refresh: boolean) {
    const { alg } = decodeProtectedHeader(token);
    if (!ALGORITHMS.includes(alg as (typeof ALGORITHMS)[number])) throw new Error('JWT_ALGORITHM_NOT_ALLOWED');
    if (refresh || !cached) cached = createLocalJWKSet(await dependencies.loadJwks());
    return jwtVerify(token, cached, { algorithms: [...ALGORITHMS], issuer, audience: 'authenticated', clockTolerance: 30 });
  }

  return {
    async verifyAccessToken(token: string): Promise<VerifiedIdentity> {
      let result;
      try {
        result = await verify(token, false);
      } catch (error) {
        if (!(error instanceof errors.JWKSNoMatchingKey)) throw error;
        result = await verify(token, true);
      }
      if (typeof result.payload.sub !== 'string' || result.payload.sub.length === 0) throw new Error('JWT_SUBJECT_REQUIRED');
      return { authSub: result.payload.sub, isAnonymous: result.payload.is_anonymous === true };
    },
  };
}
