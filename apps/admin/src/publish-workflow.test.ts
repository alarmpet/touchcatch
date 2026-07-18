import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateFixtureFile } from '../../../packages/content-validator/src/validate-content.js';
import {
  InMemoryPublishReceiptStore,
  createPublishWorkflow,
  type DeploymentPublisher,
} from './server/publish-workflow.js';

const fixturePath = resolve('content/fixtures/valid/en-intermediate.json');
const session = { actorId: 'admin-42', sessionId: 'session-9', roles: ['CONTENT_PUBLISHER'] as const };
const request = { origin: 'https://admin.spot-learn.test', csrfCookie: 'csrf-1', csrfHeader: 'csrf-1' };
const keys = { attestationKey: 'a'.repeat(48), allowedOrigin: request.origin };

async function artifact() {
  return JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
}

function harness(now = 1_000) {
  const effects: unknown[] = [];
  const publisher: DeploymentPublisher = {
    async publish(input) {
      effects.push(input);
      return { publishId: 'publish-safe-1', contentRevisionId: input.publicContent.contentRevisionId };
    },
  };
  return { effects, workflow: createPublishWorkflow({
    ...keys,
    now: () => now,
    attestationTtlMs: 30_000,
    receipts: new InMemoryPublishReceiptStore(),
    validate: async () => validateFixtureFile(fixturePath),
    publisher,
  }) };
}

describe('validated admin publishing workflow', () => {
  it('requires authorized session, exact origin and double-submit CSRF before validation', async () => {
    const { workflow } = harness();
    await expect(workflow.validate({ artifact: await artifact(), session: null, request })).rejects.toThrow('UNAUTHORIZED');
    await expect(workflow.validate({ artifact: await artifact(), session: { ...session, roles: [] }, request })).rejects.toThrow('FORBIDDEN');
    await expect(workflow.validate({ artifact: await artifact(), session, request: { ...request, origin: 'https://evil.test' } })).rejects.toThrow('ORIGIN');
    await expect(workflow.validate({ artifact: await artifact(), session, request: { ...request, csrfHeader: 'wrong' } })).rejects.toThrow('CSRF');
  });

  it('returns only a public preview DTO after validation', async () => {
    const { workflow } = harness();
    const result = await workflow.validate({ artifact: await artifact(), session, request });
    expect(result.preview).toEqual(expect.objectContaining({ contentRevisionId: expect.any(String), imageA: expect.any(Object), imageB: expect.any(Object) }));
    expect(JSON.stringify(result.preview)).not.toMatch(/canonicalAnswer|aliases|correctOptionId|privateSolution|licenseOrPermission|approverId/);
    expect(result.attestation).toMatch(/^v1\./u);
    expect(Buffer.from(result.attestation.split('.')[1]!, 'base64url').toString('utf8')).not.toMatch(/admin-42|session-9/u);
  });

  it('publishes once with a fresh artifact-bound attestation and replays the stored safe result', async () => {
    const { workflow, effects } = harness();
    const input = await artifact();
    const validated = await workflow.validate({ artifact: input, session, request });
    const first = await workflow.publish({ artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-12345678', session, request });
    const replay = await workflow.publish({ artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-12345678', session, request });
    expect(replay).toEqual(first);
    expect(effects).toHaveLength(1);
  });

  it('rejects tampering, stale attestations, actor/session changes, replay under a new key and idempotency conflicts with zero extra effects', async () => {
    let now = 1_000;
    const effects: unknown[] = [];
    const workflow = createPublishWorkflow({ ...keys, now: () => now, attestationTtlMs: 10,
      receipts: new InMemoryPublishReceiptStore(), validate: async () => validateFixtureFile(fixturePath),
      publisher: { publish: async (value) => { effects.push(value); return { publishId: 'p1', contentRevisionId: value.publicContent.contentRevisionId }; } },
    });
    const input = await artifact();
    const validated = await workflow.validate({ artifact: input, session, request });
    const changed = structuredClone(input) as Record<string, any>;
    changed.publicContent.theme = 'tampered';
    await expect(workflow.publish({ artifact: changed, attestation: validated.attestation, idempotencyKey: 'idem-tamper1', session, request })).rejects.toThrow('ATTESTATION');
    await expect(workflow.publish({ artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-actor11', session: { ...session, actorId: 'other' }, request })).rejects.toThrow('ATTESTATION');
    now = 1_010;
    await expect(workflow.publish({ artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-stale11', session, request })).rejects.toThrow('EXPIRED');
    now = 1_000;
    await workflow.publish({ artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-first111', session, request });
    await expect(workflow.publish({ artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-second11', session, request })).rejects.toThrow('REPLAY');
    const other = await artifact() as Record<string, any>;
    other.publicContent.theme = 'different';
    await expect(workflow.publish({ artifact: other, attestation: validated.attestation, idempotencyKey: 'idem-first111', session, request })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(effects).toHaveLength(1);
  });

  it('has zero committed effect when rights validation or deployment fails', async () => {
    const invalid = await artifact() as Record<string, any>;
    invalid.rightsManifest.entries[0].rights.status = 'REVIEW_REQUIRED';
    const blocked = createPublishWorkflow({ ...keys, now: () => 1, attestationTtlMs: 100,
      receipts: new InMemoryPublishReceiptStore(), validate: async () => ({ ok: false, errors: [{ path: '/rights', ruleId: 'RIGHTS_NOT_APPROVED', message: 'blocked' }] }),
      publisher: { publish: async () => { throw new Error('must not run'); } },
    });
    const result = await blocked.validate({ artifact: invalid, session, request });
    expect(result).toEqual({ ok: false, errors: [{ path: '/rights', ruleId: 'RIGHTS_NOT_APPROVED', message: 'blocked' }] });

    const failing = createPublishWorkflow({ ...keys, now: () => 1, attestationTtlMs: 100,
      receipts: new InMemoryPublishReceiptStore(), validate: async () => validateFixtureFile(fixturePath),
      publisher: { publish: async () => { throw new Error('deployment unavailable'); } },
    });
    const valid = await artifact();
    const attested = await failing.validate({ artifact: valid, session, request });
    if (!attested.ok) throw new Error('expected valid');
    await expect(failing.publish({ artifact: valid, attestation: attested.attestation, idempotencyKey: 'idem-failure1', session, request })).rejects.toThrow('deployment unavailable');
    expect(await failing.receipt('idem-failure1')).toBeUndefined();
  });

  it('binds the attestation to recomputed canonical artifact and rights hashes', async () => {
    const { workflow } = harness();
    const input = await artifact();
    const validated = await workflow.validate({ artifact: input, session, request });
    if (!validated.ok) throw new Error('expected valid');
    expect(validated.artifactHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(validated.artifactHash).not.toBe(createHash('sha256').update(JSON.stringify(input)).digest('hex'));
    expect(validated.rightsHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('collapses concurrent same-key requests to one deployment effect', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let effects = 0;
    const validation = await validateFixtureFile(fixturePath);
    const workflow = createPublishWorkflow({ ...keys, now: () => 1, attestationTtlMs: 100,
      receipts: new InMemoryPublishReceiptStore(), validate: async () => validation,
      publisher: { publish: async (value) => { effects += 1; await gate; return { publishId: 'p1', contentRevisionId: value.publicContent.contentRevisionId }; } },
    });
    const input = await artifact();
    const validated = await workflow.validate({ artifact: input, session, request });
    if (!validated.ok) throw new Error('expected valid');
    const args = { artifact: input, attestation: validated.attestation, idempotencyKey: 'idem-concurrent', session, request };
    const first = workflow.publish(args);
    const second = workflow.publish(args);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(effects).toBe(1);
    release();
    expect(await second).toEqual(await first);
  });
});
