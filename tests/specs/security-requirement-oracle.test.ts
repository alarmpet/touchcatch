import fs from 'node:fs';
import { expect, it } from 'vitest';
import { evaluateSecurityRequirement, executeRequirementOracle, type Sec001ProbeResult } from '../../tools/requirement-oracle.js';

const passingProbe = (): Sec001ProbeResult => ({
  jwtVerifier: {
    valid: 'ACCEPTED',
    badIssuer: 'REJECTED',
    badAudience: 'REJECTED',
    expired: 'REJECTED',
    badSignature: 'REJECTED',
    badAlgorithm: 'REJECTED',
    rotatedKey: 'ACCEPTED',
    rotatedJwksLoads: 2,
  },
  restSocketParity: {
    restStatus: 200,
    socketAuthenticated: true,
    sharedVerifierCallCount: 2,
    sharedVerifierInputsMatch: true,
    accountGateSubjects: ['auth-subject', 'auth-subject'],
    missingRestStatus: 401,
    anonymousRestStatus: 403,
    missingSocketError: 'UNAUTHORIZED',
    anonymousSocketError: 'ANONYMOUS_FORBIDDEN',
    inactiveSocketError: 'ACCOUNT_DELETING',
  },
  authUuidExposure: {
    resolvedParticipantKey: 'participant-opaque',
    participantMatchesAuthSub: false,
    publicResponseContainsAuthSub: false,
  },
  replayDelivery: {
    incompatibleAdmission: 'UPDATE_REQUIRED',
    requestEnvelopeAccepted: true,
    gap: 'REQUEST_REPLAY',
    stale: 'IGNORE_STALE',
    replayUnavailable: 'REPLACE_SNAPSHOT',
  },
});

it('executes exact authenticated delivery, public client, authority and preload predicates', () => {
  for (const id of ['SEC-001', 'SEC-002', 'SEC-004', 'SEC-005', 'SEC-006', 'SEC-007']) {
    expect(evaluateSecurityRequirement(id)).toBe(true);
  }
  expect(() => evaluateSecurityRequirement('SEC-999')).toThrow(/unsupported/);
});

it.each([
  {
    failure: 'SEC001_JWT_VERIFIER',
    mutate: (probe: Sec001ProbeResult) => ({
      ...probe,
      jwtVerifier: { ...probe.jwtVerifier, badIssuer: 'ACCEPTED' as const },
    }),
  },
  {
    failure: 'SEC001_REST_SOCKET_PARITY',
    mutate: (probe: Sec001ProbeResult) => ({
      ...probe,
      restSocketParity: { ...probe.restSocketParity, sharedVerifierCallCount: 1 },
    }),
  },
  {
    failure: 'SEC001_AUTH_UUID_EXPOSURE',
    mutate: (probe: Sec001ProbeResult) => ({
      ...probe,
      authUuidExposure: { ...probe.authUuidExposure, participantMatchesAuthSub: true },
    }),
  },
  {
    failure: 'SEC001_REPLAY_DELIVERY',
    mutate: (probe: Sec001ProbeResult) => ({
      ...probe,
      replayDelivery: { ...probe.replayDelivery, replayUnavailable: 'APPLY_EVENT' as const },
    }),
  },
])('SEC-001 reports $failure for its semantic probe mutation', ({ failure, mutate }) => {
  const probe = passingProbe();
  expect(evaluateSecurityRequirement('SEC-001', probe)).toBe(true);
  expect(() => evaluateSecurityRequirement('SEC-001', mutate(probe) as Sec001ProbeResult)).toThrow(new RegExp(`^${failure}$`, 'u'));
});

it('rejects a safe-looking ingress result when one path short-circuits the shared verifier', () => {
  const probe = passingProbe();
  const shortCircuited = { ...probe, restSocketParity: { ...probe.restSocketParity, sharedVerifierCallCount: 1 } };
  expect(() => evaluateSecurityRequirement('SEC-001', shortCircuited)).toThrow(/^SEC001_REST_SOCKET_PARITY$/u);
});

it('binds the SEC-001 evidence claim to the runtime probe entry', () => {
  const registry = JSON.parse(fs.readFileSync('docs/requirements-registry.v1.json', 'utf8'));
  const evidence = JSON.parse(fs.readFileSync('config/requirement-evidence.v1.json', 'utf8'));
  const row = registry.requirements.find((x: { id: string }) => x.id === 'SEC-001');
  const claim = evidence.entries.find((x: { id: string }) => x.id === 'SEC-001');
  expect(claim.oracle.input).toBe('tools/sec001-runtime-probe.ts');
  const badClaim = { ...claim, oracle: { ...claim.oracle, input: 'tools/missing-sec001-runtime-probe.ts' } };
  expect(executeRequirementOracle(process.cwd(), row, badClaim).status).toBe('FAIL');
});

it.each(['SEC-001', 'SEC-002', 'SEC-004', 'SEC-005', 'SEC-006', 'SEC-007'])('%s binds its exact source row and rejects mutation', (id) => {
  const registry = JSON.parse(fs.readFileSync('docs/requirements-registry.v1.json', 'utf8'));
  const evidence = JSON.parse(fs.readFileSync('config/requirement-evidence.v1.json', 'utf8'));
  const row = registry.requirements.find((x: { id: string }) => x.id === id);
  const claim = evidence.entries.find((x: { id: string }) => x.id === id);
  expect(executeRequirementOracle(process.cwd(), row, claim).status).toBe('PASS');
  expect(executeRequirementOracle(process.cwd(), { ...row, text: `${row.text} forged` }, claim).status).toBe('FAIL');
});
