import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { pathToFileURL } from 'node:url';
import { createAccountStore } from '../apps/server/src/account/ensure-account.js';
import { createAccessTokenVerifier } from '../apps/server/src/auth/verify.js';
import { createHttpRouter } from '../apps/server/src/http/router.js';
import { authenticateSocket } from '../apps/server/src/socket/authenticate.js';
import { clientCommandEnvelopeSchema, negotiateCompatibility, resolveAuthenticatedParticipant } from '../packages/contracts/src/socket.schema.js';
import { decideDelivery } from '../packages/contracts/src/delivery-policy.js';

export type Sec001ProbeDependencies = Readonly<{
  createAccessTokenVerifier: typeof createAccessTokenVerifier;
  createHttpRouter: typeof createHttpRouter;
  authenticateSocket: typeof authenticateSocket;
  createAccountStore: typeof createAccountStore;
  resolveAuthenticatedParticipant: typeof resolveAuthenticatedParticipant;
  negotiateCompatibility: typeof negotiateCompatibility;
  decideDelivery: typeof decideDelivery;
}>;

const defaultDependencies: Sec001ProbeDependencies = {
  createAccessTokenVerifier,
  createHttpRouter,
  authenticateSocket,
  createAccountStore,
  resolveAuthenticatedParticipant,
  negotiateCompatibility,
  decideDelivery,
};

const accepted = async (operation: () => Promise<unknown>) => {
  try { await operation(); return 'ACCEPTED' as const; }
  catch { return 'REJECTED' as const; }
};

const errorCode = async (operation: () => Promise<unknown>) => {
  try { await operation(); return 'NONE'; }
  catch (error) { return error instanceof Error ? error.message : 'UNKNOWN'; }
};

const isolated = async <T>(error: string, operation: () => T | Promise<T>): Promise<T | Readonly<{ error: string }>> => {
  try { return await operation(); }
  catch { return { error }; }
};

async function probeJwtVerifier(dependencies: Sec001ProbeDependencies) {
  const issuer = 'https://project.supabase.co/auth/v1';
  const now = Math.floor(Date.now() / 1000);
  const active = await generateKeyPair('ES256');
  const foreign = await generateKeyPair('ES256');
  const rotated = await generateKeyPair('ES256');
  const activeJwk = { ...(await exportJWK(active.publicKey)), kid: 'active', alg: 'ES256', use: 'sig' };
  const rotatedJwk = { ...(await exportJWK(rotated.publicKey)), kid: 'rotated', alg: 'ES256', use: 'sig' };
  const sign = (input: Readonly<{ issuer?: string; audience?: string; expiresAt?: number; privateKey?: CryptoKey; kid?: string }> = {}) => new SignJWT({ role: 'authenticated', is_anonymous: false })
    .setProtectedHeader({ alg: 'ES256', kid: input.kid ?? 'active' })
    .setSubject('10000000-0000-4000-8000-000000000001')
    .setIssuer(input.issuer ?? issuer)
    .setAudience(input.audience ?? 'authenticated')
    .setIssuedAt(now)
    .setExpirationTime(input.expiresAt ?? now + 300)
    .sign(input.privateKey ?? active.privateKey);
  const verifier = dependencies.createAccessTokenVerifier({ supabaseUrl: 'https://project.supabase.co', loadJwks: async () => ({ keys: [activeJwk] }) });
  const algorithmToken = `${Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'legacy' })).toString('base64url')}.${Buffer.from('{}').toString('base64url')}.signature`;
  let rotatedJwksLoads = 0;
  const rotatedVerifier = dependencies.createAccessTokenVerifier({
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

async function probeRestSocketParity(dependencies: Sec001ProbeDependencies) {
  const authSub = '10000000-0000-4000-8000-000000000001';
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
  const router = dependencies.createHttpRouter({
    verifyAccessToken: sharedVerifier,
    ensureAccount: ensureAccountActive,
    readMe: async () => ({ profile: { displayName: 'Probe Player' }, points: 7 }),
  });
  const restResponse = await router(new Request('https://api.test/v1/me', { headers: { authorization: `Bearer ${probeToken}` } }));
  const socketIdentity = await dependencies.authenticateSocket({ accessToken: probeToken }, sharedVerifier, ensureAccountActive);
  const missingRestStatus = (await router(new Request('https://api.test/v1/me'))).status;
  const anonymousRouter = dependencies.createHttpRouter({
    verifyAccessToken: async () => ({ authSub, isAnonymous: true }),
    ensureAccount: async () => true,
    readMe: async () => ({ profile: { displayName: 'unreachable' }, points: 0 }),
  });
  const anonymousRestStatus = (await anonymousRouter(new Request('https://api.test/v1/me', { headers: { authorization: `Bearer ${probeToken}` } }))).status;
  const missingSocketError = await errorCode(() => dependencies.authenticateSocket({}, sharedVerifier, ensureAccountActive));
  const anonymousSocketError = await errorCode(() => dependencies.authenticateSocket({ accessToken: probeToken }, async () => ({ authSub, isAnonymous: true }), async () => true));
  const inactiveSocketError = await errorCode(() => dependencies.authenticateSocket({ accessToken: probeToken }, async () => ({ authSub, isAnonymous: false }), async () => false));
  return {
    restStatus: restResponse.status,
    socketAuthenticated: socketIdentity.authSub === authSub && !socketIdentity.isAnonymous,
    sharedVerifierCallCount: sharedVerifierInputs.length,
    sharedVerifierInputsMatch: sharedVerifierInputs.every(value => value === probeToken),
    accountGateCallCount: accountGateSubjects.length,
    accountGateSubjectsMatch: accountGateSubjects.every(value => value === authSub),
    missingRestStatus,
    anonymousRestStatus,
    missingSocketError,
    anonymousSocketError,
    inactiveSocketError,
  };
}

async function probeAuthUuidExposure(dependencies: Sec001ProbeDependencies) {
  const authSub = '10000000-0000-4000-8000-000000000001';
  const probeToken = 'probe-token';
  const database = {
    query: async (text: string) => ({
      rows: [{ value: text.includes('read_me_v1')
        ? { profile: { displayName: 'Probe Player' }, points: 7, authSub }
        : { authSub, accountReady: true } }],
    }),
  };
  const accounts = dependencies.createAccountStore(database);
  const router = dependencies.createHttpRouter({
    verifyAccessToken: async () => ({ authSub, isAnonymous: false }),
    ensureAccount: subject => accounts.ensureAccount(subject),
    readMe: subject => accounts.readMe(subject),
  });
  const response = await router(new Request('https://api.test/v1/me', { headers: { authorization: `Bearer ${probeToken}` } }));
  const publicResponse = await response.text();
  const safeParticipantKey = dependencies.resolveAuthenticatedParticipant(authSub, [{ authSubject: authSub, matchId: 'match-1', participantKey: 'participant-opaque' }], 'match-1', 'request-1');
  let authUuidParticipantRejected = false;
  try {
    dependencies.resolveAuthenticatedParticipant(authSub, [{ authSubject: authSub, matchId: 'match-1', participantKey: authSub }], 'match-1', 'request-1');
  } catch (error) {
    authUuidParticipantRejected = error instanceof Error && error.message === 'INVALID_PARTICIPANT_MAPPING';
  }
  return {
    restStatus: response.status,
    safeParticipantKey,
    safeParticipantMatchesAuthSub: safeParticipantKey === authSub,
    authUuidParticipantRejected,
    publicResponseContainsAuthSub: publicResponse.includes(authSub),
  };
}

function probeReplayDelivery(dependencies: Sec001ProbeDependencies) {
  const matchId = '00000000-0000-4000-8000-000000000002';
  const pinned = { protocolVersion: 1 as const, engineVersion: '1', rulesetVersion: '1.0.0' as const, rulesetHash: 'a'.repeat(64), contentRevisionId: '00000000-0000-4000-8000-000000000010', contentHash: 'd'.repeat(64) };
  const admission = dependencies.negotiateCompatibility({ protocolVersion: 1, supportedEngineVersions: ['2'], supportedRulesetVersions: ['1.0.0'] }, pinned);
  const requestEnvelopeAccepted = clientCommandEnvelopeSchema.safeParse({ protocolVersion: 1, requestId: '00000000-0000-4000-8000-000000000991', matchId, expectedRevision: 0, clientSeq: 0, payload: { type: 'USE_HINT' } }).success;
  return {
    incompatibleAdmission: admission.accepted ? 'ACCEPTED' : admission.reason,
    requestEnvelopeAccepted,
    gap: dependencies.decideDelivery({ lastEventSeq: 2, stateRevision: 2 }, { kind: 'EVENT', eventSeq: 4, stateRevision: 3 }),
    stale: dependencies.decideDelivery({ lastEventSeq: 2, stateRevision: 2 }, { kind: 'EVENT', eventSeq: 2, stateRevision: 2 }),
    replayUnavailable: dependencies.decideDelivery({ lastEventSeq: 2, stateRevision: 2 }, { kind: 'REPLAY_UNAVAILABLE' }),
  };
}

export async function runSec001RuntimeProbe(overrides: Partial<Sec001ProbeDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    jwtVerifier: await isolated('JWT_PROBE_FAILED', () => probeJwtVerifier(dependencies)),
    restSocketParity: await isolated('REST_SOCKET_PROBE_FAILED', () => probeRestSocketParity(dependencies)),
    authUuidExposure: await isolated('AUTH_UUID_PROBE_FAILED', () => probeAuthUuidExposure(dependencies)),
    replayDelivery: await isolated('REPLAY_PROBE_FAILED', () => probeReplayDelivery(dependencies)),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void runSec001RuntimeProbe()
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(() => {
      process.stderr.write('SEC001_RUNTIME_PROBE_FAILED\n');
      process.exitCode = 1;
    });
}
