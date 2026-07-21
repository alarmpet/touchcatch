import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createAccessTokenVerifier } from '../apps/server/src/auth/verify.js';
import { createHttpRouter } from '../apps/server/src/http/router.js';
import { authenticateSocket } from '../apps/server/src/socket/authenticate.js';
import { clientCommandEnvelopeSchema, negotiateCompatibility, resolveAuthenticatedParticipant } from '../packages/contracts/src/socket.schema.js';
import { decideDelivery } from '../packages/contracts/src/delivery-policy.js';

const accepted = async (operation: () => Promise<unknown>) => {
  try { await operation(); return 'ACCEPTED' as const; }
  catch { return 'REJECTED' as const; }
};

const errorCode = async (operation: () => Promise<unknown>) => {
  try { await operation(); return 'NONE'; }
  catch (error) { return error instanceof Error ? error.message : 'UNKNOWN'; }
};

async function probeJwtVerifier() {
  const issuer = 'https://project.supabase.co/auth/v1';
  const now = Math.floor(Date.now() / 1000);
  const active = await generateKeyPair('ES256');
  const foreign = await generateKeyPair('ES256');
  const rotated = await generateKeyPair('ES256');
  const activeJwk = { ...(await exportJWK(active.publicKey)), kid: 'active', alg: 'ES256', use: 'sig' };
  const rotatedJwk = { ...(await exportJWK(rotated.publicKey)), kid: 'rotated', alg: 'ES256', use: 'sig' };
  const sign = (input: Readonly<{ issuer?: string; audience?: string; expiresAt?: number; privateKey?: CryptoKey; kid?: string }> = {}) => new SignJWT({ role: 'authenticated', is_anonymous: false })
    .setProtectedHeader({ alg: 'ES256', kid: input.kid ?? 'active' })
    .setSubject('auth-subject')
    .setIssuer(input.issuer ?? issuer)
    .setAudience(input.audience ?? 'authenticated')
    .setIssuedAt(now)
    .setExpirationTime(input.expiresAt ?? now + 300)
    .sign(input.privateKey ?? active.privateKey);
  const verifier = createAccessTokenVerifier({ supabaseUrl: 'https://project.supabase.co', loadJwks: async () => ({ keys: [activeJwk] }) });
  const algorithmToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'legacy' })).toString('base64url')}.${Buffer.from('{}').toString('base64url')}.signature`;
  let rotatedJwksLoads = 0;
  const rotatedVerifier = createAccessTokenVerifier({
    supabaseUrl: 'https://project.supabase.co',
    loadJwks: async () => ({ keys: ++rotatedJwksLoads === 1 ? [activeJwk] : [rotatedJwk] }),
  });
  return {
    valid: await accepted(async () => verifier.verifyAccessToken(await sign())),
    badIssuer: await accepted(async () => verifier.verifyAccessToken(await sign({ issuer: 'https://attacker.test/auth/v1' }))),
    badAudience: await accepted(async () => verifier.verifyAccessToken(await sign({ audience: 'service_role' }))),
    expired: await accepted(async () => verifier.verifyAccessToken(await sign({ expiresAt: now - 31 }))),
    badSignature: await accepted(async () => verifier.verifyAccessToken(await sign({ privateKey: foreign.privateKey }))),
    badAlgorithm: await accepted(() => verifier.verifyAccessToken(algorithmToken)),
    rotatedKey: await accepted(async () => rotatedVerifier.verifyAccessToken(await sign({ privateKey: rotated.privateKey, kid: 'rotated' }))),
    rotatedJwksLoads,
  };
}

async function probeIngressAndPrivacy() {
  const authSub = 'auth-subject';
  const probeToken = 'probe-token';
  const sharedVerifierInputs: string[] = [];
  const accountGateSubjects: string[] = [];
  const sharedVerifier = async (token: string) => {
    sharedVerifierInputs.push(token);
    return { authSub, isAnonymous: false };
  };
  const ensureAccountActive = async (subject: string) => {
    accountGateSubjects.push(subject);
    return true;
  };
  const router = createHttpRouter({
    verifyAccessToken: sharedVerifier,
    ensureAccount: ensureAccountActive,
    readMe: async () => ({ profile: { displayName: 'Probe Player' }, points: 7 }),
  });
  const restResponse = await router(new Request('https://api.test/v1/me', { headers: { authorization: `Bearer ${probeToken}` } }));
  const publicResponse = await restResponse.text();
  const socketIdentity = await authenticateSocket({ accessToken: probeToken }, sharedVerifier, ensureAccountActive);
  const missingRestStatus = (await router(new Request('https://api.test/v1/me'))).status;
  const anonymousRouter = createHttpRouter({
    verifyAccessToken: async () => ({ authSub, isAnonymous: true }),
    ensureAccount: async () => true,
    readMe: async () => ({ profile: { displayName: 'unreachable' }, points: 0 }),
  });
  const anonymousRestStatus = (await anonymousRouter(new Request('https://api.test/v1/me', { headers: { authorization: `Bearer ${probeToken}` } }))).status;
  const missingSocketError = await errorCode(() => authenticateSocket({}, sharedVerifier, ensureAccountActive));
  const anonymousSocketError = await errorCode(() => authenticateSocket({ accessToken: probeToken }, async () => ({ authSub, isAnonymous: true }), async () => true));
  const inactiveSocketError = await errorCode(() => authenticateSocket({ accessToken: probeToken }, async () => ({ authSub, isAnonymous: false }), async () => false));
  const resolvedParticipantKey = resolveAuthenticatedParticipant(authSub, [{ authSubject: authSub, matchId: 'match-1', participantKey: 'participant-opaque' }], 'match-1', 'request-1');
  return {
    restSocketParity: {
      restStatus: restResponse.status,
      socketAuthenticated: socketIdentity.authSub === authSub && !socketIdentity.isAnonymous,
      sharedVerifierCallCount: sharedVerifierInputs.length,
      sharedVerifierInputsMatch: sharedVerifierInputs.every(value => value === probeToken),
      accountGateSubjects,
      missingRestStatus,
      anonymousRestStatus,
      missingSocketError,
      anonymousSocketError,
      inactiveSocketError,
    },
    authUuidExposure: {
      resolvedParticipantKey,
      participantMatchesAuthSub: resolvedParticipantKey === authSub,
      publicResponseContainsAuthSub: publicResponse.includes(authSub),
    },
  };
}

function probeReplayDelivery() {
  const matchId = '00000000-0000-4000-8000-000000000002';
  const pinned = { protocolVersion: 1 as const, engineVersion: '1', rulesetVersion: '1.0.0' as const, rulesetHash: 'a'.repeat(64), contentRevisionId: '00000000-0000-4000-8000-000000000010', contentHash: 'd'.repeat(64) };
  const admission = negotiateCompatibility({ protocolVersion: 1, supportedEngineVersions: ['2'], supportedRulesetVersions: ['1.0.0'] }, pinned);
  const requestEnvelopeAccepted = clientCommandEnvelopeSchema.safeParse({ protocolVersion: 1, requestId: '00000000-0000-4000-8000-000000000991', matchId, expectedRevision: 0, clientSeq: 0, payload: { type: 'USE_HINT' } }).success;
  return {
    incompatibleAdmission: admission.accepted ? 'ACCEPTED' : admission.reason,
    requestEnvelopeAccepted,
    gap: decideDelivery({ lastEventSeq: 2, stateRevision: 2 }, { kind: 'EVENT', eventSeq: 4, stateRevision: 3 }),
    stale: decideDelivery({ lastEventSeq: 2, stateRevision: 2 }, { kind: 'EVENT', eventSeq: 2, stateRevision: 2 }),
    replayUnavailable: decideDelivery({ lastEventSeq: 2, stateRevision: 2 }, { kind: 'REPLAY_UNAVAILABLE' }),
  };
}

async function main() {
  const ingress = await probeIngressAndPrivacy();
  const result = {
    jwtVerifier: await probeJwtVerifier(),
    restSocketParity: ingress.restSocketParity,
    authUuidExposure: ingress.authUuidExposure,
    replayDelivery: probeReplayDelivery(),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'UNKNOWN';
  process.stderr.write(`SEC001_RUNTIME_PROBE_FAILED:${message}\n`);
  process.exitCode = 1;
});
