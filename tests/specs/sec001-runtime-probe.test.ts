import { expect, it } from 'vitest';
import path from 'node:path';
import { createAccountStore } from '../../apps/server/src/account/ensure-account.js';
import { assertSec001ProbeResult } from '../../tools/requirement-oracle.js';
import { runSec001RuntimeProbe, type Sec001ProbeDependencies } from '../../tools/sec001-runtime-probe.js';

const expectFailure = async (failure: string, dependencies: Partial<Sec001ProbeDependencies>) => {
  const result = await runSec001RuntimeProbe(dependencies);
  expect(() => assertSec001ProbeResult(result)).toThrow(new RegExp(`^${failure}$`, 'u'));
};

it('executes the default production SEC-001 runtime probe', async () => {
  const result = await runSec001RuntimeProbe();
  expect(() => assertSec001ProbeResult(result)).not.toThrow();
});

it('constructs the child launch paths from an explicit repository root', async () => {
  const oracleModule = await import('../../tools/requirement-oracle.js');
  expect(typeof oracleModule.resolveSec001ProbeLaunch).toBe('function');
  const root = path.resolve('explicit-sec001-root');
  expect(oracleModule.resolveSec001ProbeLaunch(root)).toEqual({
    cwd: root,
    tsxEntry: path.join(root, 'node_modules/tsx/dist/cli.mjs'),
    probeEntry: path.join(root, 'tools/sec001-runtime-probe.ts'),
  });
});

it('projects a malicious DB auth UUID out of the real account read store', async () => {
  const authSub = '10000000-0000-4000-8000-000000000001';
  const store = createAccountStore({ query: async () => ({ rows: [{ value: { profile: { displayName: 'Probe Player' }, points: 7, authSub } }] }) });
  const publicMe = await store.readMe(authSub);
  expect(publicMe).toEqual({ profile: { displayName: 'Probe Player' }, points: 7 });
  expect(JSON.stringify(publicMe)).not.toContain(authSub);
});

it('detects a safe-looking HTTP short-circuit that skips the shared verifier', async () => {
  await expectFailure('SEC001_REST_SOCKET_PARITY', {
    createHttpRouter: (() => async () => Response.json({ profile: { displayName: 'Probe Player' }, points: 7 })) as Sec001ProbeDependencies['createHttpRouter'],
  });
});

it('detects a malicious participant resolver that returns the auth UUID', async () => {
  await expectFailure('SEC001_AUTH_UUID_EXPOSURE', {
    resolveAuthenticatedParticipant: ((subject: string) => subject) as Sec001ProbeDependencies['resolveAuthenticatedParticipant'],
  });
});

it('detects a malicious account store that returns the auth UUID publicly', async () => {
  await expectFailure('SEC001_AUTH_UUID_EXPOSURE', {
    createAccountStore: (() => ({
      ensureAccount: async () => true,
      readMe: async (authSub: string) => ({ profile: { displayName: 'Probe Player' }, points: 7, authSub }),
    })) as Sec001ProbeDependencies['createAccountStore'],
  });
});

it('detects a verifier that accepts every JWT fixture', async () => {
  await expectFailure('SEC001_JWT_VERIFIER', {
    createAccessTokenVerifier: (() => ({ verifyAccessToken: async () => ({ authSub: '10000000-0000-4000-8000-000000000001', isAnonymous: false }) })) as Sec001ProbeDependencies['createAccessTokenVerifier'],
  });
});

it('detects a delivery implementation that applies every input', async () => {
  await expectFailure('SEC001_REPLAY_DELIVERY', {
    decideDelivery: (() => 'APPLY_EVENT') as Sec001ProbeDependencies['decideDelivery'],
  });
});

it.each([
  ['SEC001_JWT_VERIFIER', { createAccessTokenVerifier: (() => { throw new Error('jwt probe failure'); }) as Sec001ProbeDependencies['createAccessTokenVerifier'] }],
  ['SEC001_REST_SOCKET_PARITY', { createHttpRouter: (() => { throw new Error('REST probe failure'); }) as Sec001ProbeDependencies['createHttpRouter'] }],
  ['SEC001_AUTH_UUID_EXPOSURE', { resolveAuthenticatedParticipant: (() => { throw new Error('privacy probe failure'); }) as Sec001ProbeDependencies['resolveAuthenticatedParticipant'] }],
  ['SEC001_REPLAY_DELIVERY', { decideDelivery: (() => { throw new Error('replay probe failure'); }) as Sec001ProbeDependencies['decideDelivery'] }],
] as const)('attributes an isolated behavior error to %s', async (failure, dependencies) => {
  await expectFailure(failure, dependencies);
});
