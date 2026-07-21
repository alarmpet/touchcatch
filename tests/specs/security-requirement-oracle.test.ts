import fs from 'node:fs';
import { expect, it } from 'vitest';
import { evaluateSecurityRequirement, executeRequirementOracle } from '../../tools/requirement-oracle.js';
import { resolveAuthenticatedParticipant } from '../../packages/contracts/src/socket.schema.js';

it('rejects an auth UUID reused as its match participant key', () => {
  const authSub = '10000000-0000-4000-8000-000000000001';
  expect(() => resolveAuthenticatedParticipant(authSub, [{ authSubject: authSub, matchId: 'match-1', participantKey: authSub }], 'match-1', 'request-1')).toThrow('INVALID_PARTICIPANT_MAPPING');
});

it('executes exact authenticated delivery, public client, authority and preload predicates', () => {
  for (const id of ['SEC-001', 'SEC-002', 'SEC-004', 'SEC-005', 'SEC-006', 'SEC-007']) {
    expect(evaluateSecurityRequirement(id)).toBe(true);
  }
  expect(() => evaluateSecurityRequirement('SEC-999')).toThrow(/unsupported/);
});

it('keeps SEC-001 child launch failures distinct from semantic probe failures', () => {
  expect(() => evaluateSecurityRequirement('SEC-001', process.cwd(), 'tools/missing-sec001-runtime-probe.ts')).toThrow(/^SEC001_RUNTIME_PROBE_EXECUTION_FAILED$/u);
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
