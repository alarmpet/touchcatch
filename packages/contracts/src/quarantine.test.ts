import { expect, it } from 'vitest';
import { createQuarantineJob, parseQuarantinePolicy, runQuarantineJob, scanNestedPii } from './quarantine.js';

const policy = parseQuarantinePolicy({
  policyVersion: 'approved-2026-07', approvalId: 'LEGAL-123', action: 'REDACT',
  fields: ['profile.email', 'events[].payload.contact'], legalHoldPrecedence: 'BLOCK_ACTION',
});

it('requires approved policy inputs without inventing retention or legal basis', () => {
  expect(() => parseQuarantinePolicy({ policyVersion: 'x' })).toThrow();
  expect(policy).not.toHaveProperty('retentionDays');
  expect(policy).not.toHaveProperty('legalBasis');
});

it('dry-runs, applies, retries and resumes without raw PII or stable source hashes in audit', () => {
  const source = { profile: { email: 'person@example.test' }, events: [{ payload: { contact: '010-1234' } }] };
  const job = createQuarantineJob('job-1', policy, source);
  const dry = runQuarantineJob(job, 'DRY_RUN');
  expect(dry.audit).toEqual({ jobId: 'job-1', action: 'REDACT', affectedFieldCount: 2, status: 'PLANNED' });
  expect(JSON.stringify(dry.audit)).not.toMatch(/person|010|sha|hash/i);
  const applied = runQuarantineJob(dry.job, 'APPLY');
  expect(applied.value).toEqual({ profile: { email: null }, events: [{ payload: { contact: null } }] });
  expect(runQuarantineJob(applied.job, 'APPLY')).toEqual(applied);
  expect(scanNestedPii(applied.value)).toEqual(['events[0].payload.contact', 'profile.email']);
  expect(JSON.stringify(applied.value)).not.toMatch(/person@example|010-1234/);
});
