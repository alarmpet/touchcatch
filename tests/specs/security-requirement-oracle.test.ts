import fs from 'node:fs';
import { expect, it } from 'vitest';
import { evaluateSecurityRequirement, executeRequirementOracle } from '../../tools/requirement-oracle.js';

const read = (file: string) => fs.readFileSync(file, 'utf8');
const sec001Evidence = () => ({
  jwtVerifierSource: read('apps/server/src/auth/verify.ts'),
  jwtVerifierTest: read('apps/server/src/auth/verify.test.ts'),
  httpIngressSource: read('apps/server/src/http/router.ts'),
  httpIngressTest: read('apps/server/src/http/router.test.ts'),
  socketIngressSource: read('apps/server/src/socket/authenticate.ts'),
  socketIngressTest: read('apps/server/src/socket/authenticate.test.ts'),
  authUuidBoundaryTest: read('supabase/tests/database/invariants.test.sql'),
  replayDeliveryTest: read('packages/contracts/src/delivery-policy.test.ts'),
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
    mutate: (evidence: ReturnType<typeof sec001Evidence>) => ({
      ...evidence,
      jwtVerifierSource: evidence.jwtVerifierSource.replace("audience: 'authenticated'", "audience: 'service_role'"),
    }),
  },
  {
    failure: 'SEC001_REST_SOCKET_PARITY',
    mutate: (evidence: ReturnType<typeof sec001Evidence>) => ({
      ...evidence,
      socketIngressSource: evidence.socketIngressSource.replace('verifyAccessToken(handshake.accessToken)', "verifyAccessToken('different-token')"),
    }),
  },
  {
    failure: 'SEC001_AUTH_UUID_EXPOSURE',
    mutate: (evidence: ReturnType<typeof sec001Evidence>) => ({
      ...evidence,
      authUuidBoundaryTest: evidence.authUuidBoundaryTest.replace(
        "'10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'",
        "'40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001'",
      ),
    }),
  },
  {
    failure: 'SEC001_REPLAY_DELIVERY',
    mutate: (evidence: ReturnType<typeof sec001Evidence>) => ({
      ...evidence,
      replayDeliveryTest: evidence.replayDeliveryTest.replace("toBe('REQUEST_REPLAY')", "toBe('APPLY_EVENT')"),
    }),
  },
])('SEC-001 reports $failure for its behavior-bearing evidence mutation', ({ failure, mutate }) => {
  const evidence = sec001Evidence();
  expect(evaluateSecurityRequirement('SEC-001', evidence)).toBe(true);
  expect(() => evaluateSecurityRequirement('SEC-001', mutate(evidence))).toThrow(new RegExp(`^${failure}$`, 'u'));
});

it.each(['SEC-001', 'SEC-002', 'SEC-004', 'SEC-005', 'SEC-006', 'SEC-007'])('%s binds its exact source row and rejects mutation', (id) => {
  const registry = JSON.parse(fs.readFileSync('docs/requirements-registry.v1.json', 'utf8'));
  const evidence = JSON.parse(fs.readFileSync('config/requirement-evidence.v1.json', 'utf8'));
  const row = registry.requirements.find((x: { id: string }) => x.id === id);
  const claim = evidence.entries.find((x: { id: string }) => x.id === id);
  expect(executeRequirementOracle(process.cwd(), row, claim).status).toBe('PASS');
  expect(executeRequirementOracle(process.cwd(), { ...row, text: `${row.text} forged` }, claim).status).toBe('FAIL');
});
