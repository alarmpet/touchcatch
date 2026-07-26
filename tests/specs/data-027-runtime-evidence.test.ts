import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';

const observationFsState = vi.hoisted(() => ({
  failPublicationLockRemoval: false,
  openedPaths: [] as string[],
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    openSync: ((target: Parameters<typeof actual.openSync>[0], ...args: unknown[]) => {
      observationFsState.openedPaths.push(String(target));
      return (actual.openSync as (...parameters: unknown[]) => number)(target, ...args);
    }) as typeof actual.openSync,
    rmSync: ((target: Parameters<typeof actual.rmSync>[0], ...args: unknown[]) => {
      if (
        observationFsState.failPublicationLockRemoval
        && String(target).endsWith('publication.lock')
      ) {
        throw new Error('simulated publication lock release failure');
      }
      return (actual.rmSync as (...parameters: unknown[]) => void)(
        target,
        ...args,
      );
    }) as typeof actual.rmSync,
  };
});

import {
  DATA_027_RECEIPT_RELATIVE_PATH,
  buildData027EvidenceManifest,
  buildEvidenceInputs,
  validateData027Observation,
  validateData027Receipt,
  type Data027Observation,
} from '../../tools/data-027-runtime-evidence.js';
import { maybeWriteData027Observation } from '../support/data-027-observation.js';
import { writeData027ReceiptFixture } from '../support/data-027-receipt-fixture.js';

const roots: string[] = [];
const data027GateEnvironment = {
  gateRunId: process.env.TOUCHCATCH_DATA027_GATE_RUN_ID,
  observationPath: process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH,
};
const gateRunId = '00000000-0000-4000-8000-000000000001';

const runtimeObservationInput = {
  sessionsAttempted: 20,
  successfulSeats: 2,
  verifiedRoles: Array.from({ length: 20 }, () => 'app_server'),
  databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres',
};

const validObservation: Data027Observation = {
  schemaVersion: 1,
  gateRunId,
  requirementId: 'DATA-027',
  sessionsAttempted: 20,
  successfulSeats: 2,
  requiredRole: 'app_server',
  databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE',
  testStatus: 'PASS',
};

const commitSha = 'a'.repeat(40);
const writeData027Receipt = (
  root: string,
  _observation: Data027Observation,
  provenanceSha: string,
): void => {
  writeData027ReceiptFixture(root, provenanceSha);
};

const write = (root: string, relativePath: string, content = relativePath): void => {
  const target = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};

const concurrencyDependencyPaths = [
  'config/client-runtime-policy.v1.json',
  'config/content-validation-policy.v1.json',
  'config/ruleset.v1.json',
  'content/fixtures/assets/59ab13e90d337af02e94c8c9dbfd8aff8dbd54b203acfe768a3641e0b70ab189.png',
  'content/fixtures/assets/80141f74c0f7353bba31d9952bdbeb4d715716065b6cff2e591f94fa3763129e.png',
  'content/fixtures/assets/90fce90a3fd50fb9ea665634fc3d5651452ec44369e5375c7e2197c2c5211b18.png',
  'content/fixtures/valid/en-intermediate.json',
  'content/fixtures/valid/ko-beginner.json',
  'packages/content-validator/package.json',
  'packages/content-validator/src/validate-content.ts',
  'packages/contracts/package.json',
  'packages/contracts/src/analytics.ts',
  'packages/contracts/src/answer-normalization.ts',
  'packages/contracts/src/attempt-limiter.ts',
  'packages/contracts/src/auth.ts',
  'packages/contracts/src/content.ts',
  'packages/contracts/src/delivery-policy.ts',
  'packages/contracts/src/economy.schema.ts',
  'packages/contracts/src/economy.ts',
  'packages/contracts/src/idempotency.ts',
  'packages/contracts/src/index.ts',
  'packages/contracts/src/integration-evidence.ts',
  'packages/contracts/src/match.schema.ts',
  'packages/contracts/src/match.ts',
  'packages/contracts/src/pet-catalog.ts',
  'packages/contracts/src/projection.ts',
  'packages/contracts/src/quarantine.ts',
  'packages/contracts/src/rest-idempotency.ts',
  'packages/contracts/src/rules.schema.ts',
  'packages/contracts/src/rules.ts',
  'packages/contracts/src/socket.schema.ts',
  'packages/contracts/src/socket.ts',
  'packages/contracts/src/ui.ts',
  'pnpm-workspace.yaml',
  'schemas/economy.schema.json',
  'schemas/pet-catalog.schema.json',
  'schemas/ruleset.schema.json',
  'tsconfig.json',
] as const;

const expectedEvidencePaths = [
  'config/client-runtime-policy.v1.json',
  'config/content-validation-policy.v1.json',
  'config/ruleset.v1.json',
  'content/fixtures/assets/59ab13e90d337af02e94c8c9dbfd8aff8dbd54b203acfe768a3641e0b70ab189.png',
  'content/fixtures/assets/80141f74c0f7353bba31d9952bdbeb4d715716065b6cff2e591f94fa3763129e.png',
  'content/fixtures/assets/90fce90a3fd50fb9ea665634fc3d5651452ec44369e5375c7e2197c2c5211b18.png',
  'content/fixtures/valid/en-intermediate.json',
  'content/fixtures/valid/ko-beginner.json',
  'package.json',
  'packages/content-validator/package.json',
  'packages/content-validator/src/validate-content.ts',
  'packages/contracts/package.json',
  'packages/contracts/src/analytics.ts',
  'packages/contracts/src/answer-normalization.ts',
  'packages/contracts/src/attempt-limiter.ts',
  'packages/contracts/src/auth.ts',
  'packages/contracts/src/canonical-json.ts',
  'packages/contracts/src/content.ts',
  'packages/contracts/src/delivery-policy.ts',
  'packages/contracts/src/economy.schema.ts',
  'packages/contracts/src/economy.ts',
  'packages/contracts/src/idempotency.ts',
  'packages/contracts/src/index.ts',
  'packages/contracts/src/integration-evidence.ts',
  'packages/contracts/src/match.schema.ts',
  'packages/contracts/src/match.ts',
  'packages/contracts/src/pet-catalog.ts',
  'packages/contracts/src/projection.ts',
  'packages/contracts/src/quarantine.ts',
  'packages/contracts/src/rest-idempotency.ts',
  'packages/contracts/src/rules.schema.ts',
  'packages/contracts/src/rules.ts',
  'packages/contracts/src/socket.schema.ts',
  'packages/contracts/src/socket.ts',
  'packages/contracts/src/ui.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'schemas/economy.schema.json',
  'schemas/pet-catalog.schema.json',
  'schemas/ruleset.schema.json',
  'supabase/config.toml',
  'supabase/migrations/202607260001_schema.sql',
  'supabase/migrations/202607260010_schema.sql',
  'supabase/roles.sql',
  'supabase/tests/database/runtime.test.sql',
  'supabase/tests/database/support/runtime.inc',
  'tests/database/concurrency.test.ts',
  'tests/support/data-027-observation.ts',
  'tests/support/local-supabase-status.ts',
  'tools/check-runtime.mjs',
  'tools/data-027-runtime-evidence.ts',
  'tools/internal/run-supabase-gate-core.mjs',
  'tools/requirement-oracle.ts',
  'tools/run-pnpm.mjs',
  'tools/run-supabase-gate.mjs',
  'tsconfig.json',
  'vitest.db.config.ts',
] as const;

const createRepository = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'data-027-evidence-'));
  roots.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  write(root, 'supabase/migrations/202607260001_schema.sql', 'create table evidence ();');
  write(root, 'supabase/migrations/202607260010_schema.sql', 'create table evidence_more ();');
  write(root, 'supabase/tests/database/runtime.test.sql', 'select 1;');
  write(root, 'supabase/tests/database/support/runtime.inc', '\\set fixture 1');
  for (const file of [
    ...concurrencyDependencyPaths,
    'packages/contracts/src/canonical-json.ts',
    'supabase/config.toml',
    'supabase/roles.sql',
    'tests/database/concurrency.test.ts',
    'tests/support/data-027-observation.ts',
    'tests/support/local-supabase-status.ts',
    'vitest.db.config.ts',
    'tools/check-runtime.mjs',
    'tools/internal/run-supabase-gate-core.mjs',
    'tools/run-supabase-gate.mjs',
    'tools/run-pnpm.mjs',
    'tools/data-027-runtime-evidence.ts',
    'tools/requirement-oracle.ts',
    'pnpm-lock.yaml',
  ]) write(root, file);
  write(root, 'package.json', JSON.stringify({
    packageManager: 'pnpm@11.13.0',
    engines: { node: '24.18.0', pnpm: '11.13.0' },
  }));
  return root;
};

const receiptPath = (root: string): string => join(root, ...DATA_027_RECEIPT_RELATIVE_PATH.split('/'));
const publicationLockPath = (root: string): string => join(
  dirname(receiptPath(root)),
  'publication.lock',
);
const observationRunDirectory = (runId: string): string =>
  join(tmpdir(), 'touchcatch-data-027', runId);
const privateObservationPath = (runId: string): string =>
  join(observationRunDirectory(runId), 'observation.json');
const prepareObservationRun = (runId = gateRunId): string => {
  const directory = observationRunDirectory(runId);
  mkdirSync(dirname(directory), { recursive: true });
  mkdirSync(directory);
  roots.push(directory);
  return privateObservationPath(runId);
};

const readReceipt = (root: string): Record<string, unknown> => JSON.parse(readFileSync(receiptPath(root), 'utf8')) as Record<string, unknown>;

const overwriteReceipt = (root: string, value: unknown): void => writeFileSync(receiptPath(root), JSON.stringify(value));

const hashCanonicalJson = (value: unknown): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;

const rehashReceipt = (receipt: Record<string, unknown>): void => {
  receipt.evidenceInputsSha256 = hashCanonicalJson({
    evidenceInputs: receipt.evidenceInputs,
    runtimeVersions: receipt.runtimeVersions,
  });
  const { receiptSha256: _receiptSha256, ...payload } = receipt;
  receipt.receiptSha256 = hashCanonicalJson(payload);
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  observationFsState.failPublicationLockRemoval = false;
  observationFsState.openedPaths.length = 0;
  if (data027GateEnvironment.gateRunId === undefined) delete process.env.TOUCHCATCH_DATA027_GATE_RUN_ID;
  else process.env.TOUCHCATCH_DATA027_GATE_RUN_ID = data027GateEnvironment.gateRunId;
  if (data027GateEnvironment.observationPath === undefined) delete process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH;
  else process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH = data027GateEnvironment.observationPath;
});

describe('DATA-027 runtime evidence', () => {
  it('keeps synthetic publication out of the production evidence contract', async () => {
    const evidenceContract = await import('../../tools/data-027-runtime-evidence.js');

    expect(evidenceContract).not.toHaveProperty('writeData027Receipt');

    const root = createRepository();
    expect(() => writeData027ReceiptFixture(root)).not.toThrow();
    expect(validateData027Receipt(root)).toBe(true);
  });

  it('binds the complete trust path and exact runtime fields into one manifest', () => {
    const root = createRepository();
    const manifest = buildData027EvidenceManifest(root);

    expect(manifest.runtimeVersions).toEqual({
      node: 'v24.18.0',
      pnpm: '11.13.0',
    });
    expect(manifest.evidenceInputs.map((input) => input.path)).toEqual(
      expectedEvidencePaths,
    );
    expect(manifest.evidenceInputsSha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it('performs no observation filesystem write without a DATA-027 gate run', () => {
    delete process.env.TOUCHCATCH_DATA027_GATE_RUN_ID;
    delete process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH;
    observationFsState.openedPaths.length = 0;

    maybeWriteData027Observation(runtimeObservationInput);

    expect(observationFsState.openedPaths).toEqual([]);
  });

  it('rejects a non-UUID gate run and never trusts an arbitrary output environment path', () => {
    const arbitraryPath = join(mkdtempSync(join(tmpdir(), 'data-027-arbitrary-')), 'redirected.json');
    roots.push(dirname(arbitraryPath));
    process.env.TOUCHCATCH_DATA027_GATE_RUN_ID = 'run-a';
    process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH = arbitraryPath;

    expect(() => maybeWriteData027Observation(runtimeObservationInput)).toThrow('DATA_027_OBSERVATION_INVALID');
    expect(existsSync(arbitraryPath)).toBe(false);
  });

  it('rejects a remote or different-loopback database before writing an observation', () => {
    const observationPath = prepareObservationRun();
    process.env.TOUCHCATCH_DATA027_GATE_RUN_ID = gateRunId;

    expect(() => maybeWriteData027Observation({ ...runtimeObservationInput, databaseUrl: 'postgresql://db.example.test/postgres' }))
      .toThrow('DATA_027_OBSERVATION_INVALID');
    expect(existsSync(observationPath)).toBe(false);

    expect(() => maybeWriteData027Observation({
      ...runtimeObservationInput,
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:59999/postgres',
    })).toThrow('DATA_027_OBSERVATION_INVALID');
    expect(existsSync(observationPath)).toBe(false);
  });

  it('writes only to the private run directory and ignores an arbitrary path override', () => {
    const observationPath = prepareObservationRun();
    const arbitraryPath = join(mkdtempSync(join(tmpdir(), 'data-027-arbitrary-')), 'redirected.json');
    roots.push(dirname(arbitraryPath));
    process.env.TOUCHCATCH_DATA027_GATE_RUN_ID = gateRunId;
    process.env.TOUCHCATCH_DATA027_OBSERVATION_PATH = arbitraryPath;

    maybeWriteData027Observation(runtimeObservationInput);

    expect(JSON.parse(readFileSync(observationPath, 'utf8'))).toEqual(validObservation);
    expect(existsSync(arbitraryPath)).toBe(false);
  });

  it('rejects a junction-redirection attempt in the private run path', () => {
    const runDirectory = observationRunDirectory(gateRunId);
    const external = mkdtempSync(join(tmpdir(), 'data-027-external-'));
    roots.push(runDirectory, external);
    mkdirSync(dirname(runDirectory), { recursive: true });
    symlinkSync(external, runDirectory, 'junction');
    process.env.TOUCHCATCH_DATA027_GATE_RUN_ID = gateRunId;

    expect(() => maybeWriteData027Observation(runtimeObservationInput)).toThrow(
      'DATA_027_OBSERVATION_INVALID',
    );
    expect(readdirSync(external)).toEqual([]);
  });

  it('accepts only the exact runtime observation contract', () => {
    expect(() => validateData027Observation(validObservation, gateRunId)).not.toThrow();

    const mutations: readonly [string, unknown][] = [
      ['missing key', (() => { const { testStatus: _unused, ...value } = validObservation; return value; })()],
      ['extra key', { ...validObservation, password: 'secret' }],
      ['wrong type', { ...validObservation, sessionsAttempted: '20' }],
      ['too few sessions', { ...validObservation, sessionsAttempted: 19 }],
      ['too many sessions', { ...validObservation, sessionsAttempted: 21 }],
      ['too few seats', { ...validObservation, successfulSeats: 1 }],
      ['too many seats', { ...validObservation, successfulSeats: 3 }],
      ['wrong role', { ...validObservation, requiredRole: 'postgres' }],
      ['wrong origin', { ...validObservation, databaseOrigin: 'REMOTE_DATABASE' }],
      ['wrong run id', { ...validObservation, gateRunId: 'run-b' }],
    ];

    for (const [_label, value] of mutations) {
      expect(() => validateData027Observation(value, gateRunId)).toThrow('DATA_027_OBSERVATION_INVALID');
    }
  });

  it('writes a canonical, fresh receipt and ignores commit-only provenance changes', () => {
    const root = createRepository();
    expect(validateData027Receipt(root)).toBe(false);

    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    expect(Object.keys(receipt).sort()).toEqual([
      'commitSha', 'databaseOrigin', 'evidenceInputs', 'evidenceInputsSha256', 'receiptSha256',
      'requiredRole', 'requirementId', 'runtimeVersions', 'schemaVersion', 'scope', 'sessionsAttempted',
      'successfulSeats', 'testStatus',
    ]);
    expect(receipt).not.toHaveProperty('gateRunId');
    expect(receipt).not.toHaveProperty('password');
    expect(validateData027Receipt(root)).toBe(true);

    writeData027Receipt(root, validObservation, 'b'.repeat(40));
    expect(validateData027Receipt(root)).toBe(true);
  });

  it('accepts a differently ordered JSON object because the receipt hash is canonical', () => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    overwriteReceipt(root, Object.fromEntries(Object.entries(receipt).reverse()));
    expect(validateData027Receipt(root)).toBe(true);
  });

  it('blocks an otherwise valid receipt while its worktree publication lock exists', () => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const publicationLock = join(
      root,
      '.superpowers',
      'evidence',
      'data-027',
      'publication.lock',
    );

    writeFileSync(publicationLock, 'held');
    expect(validateData027Receipt(root)).toBe(false);

    rmSync(publicationLock);
    expect(validateData027Receipt(root)).toBe(true);
  });

  it.each([
    ['missing receipt', (root: string) => {
      mkdirSync(dirname(receiptPath(root)), { recursive: true });
    }],
    ['malformed receipt', (root: string) => {
      mkdirSync(dirname(receiptPath(root)), { recursive: true });
      writeFileSync(receiptPath(root), '{');
    }],
    ['manifest reconstruction exception', (root: string) => {
      writeData027Receipt(root, validObservation, commitSha);
      rmSync(join(
        root,
        'packages',
        'contracts',
        'src',
        'integration-evidence.ts',
      ));
    }],
  ])('releases validator publication-lock ownership after a %s', (
    _label,
    arrange,
  ) => {
    const root = createRepository();
    arrange(root);

    expect(validateData027Receipt(root)).toBe(false);
    expect(existsSync(publicationLockPath(root))).toBe(false);
  });

  it('returns false and retains the lock when validator lock release fails', () => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    observationFsState.failPublicationLockRemoval = true;

    try {
      expect(validateData027Receipt(root)).toBe(false);
      expect(existsSync(publicationLockPath(root))).toBe(true);
    } finally {
      observationFsState.failPublicationLockRemoval = false;
      rmSync(publicationLockPath(root), { force: true });
    }
  });

  it('uses an exact worktree-local receipt path and confines fixtures to temp repositories', () => {
    const root = createRepository();
    expect(DATA_027_RECEIPT_RELATIVE_PATH).toBe('.superpowers/evidence/data-027/receipt.json');
    expect(DATA_027_RECEIPT_RELATIVE_PATH.split('/')).not.toContain('..');
    writeData027Receipt(root, validObservation, commitSha);
    expect(existsSync(receiptPath(root))).toBe(true);
    expect(() => writeData027ReceiptFixture(process.cwd())).toThrow(
      'DATA_027_TEST_FIXTURE_REQUIRES_TEMP_REPOSITORY',
    );
  });

  it.each([
    ['missing key', (receipt: Record<string, unknown>) => { delete receipt.testStatus; }],
    ['extra secret-like key', (receipt: Record<string, unknown>) => { receipt.token = 'secret'; }],
    ['wrong type', (receipt: Record<string, unknown>) => { receipt.sessionsAttempted = '20'; }],
    ['wrong acceptance value', (receipt: Record<string, unknown>) => { receipt.successfulSeats = 3; }],
    ['wrong payload hash', (receipt: Record<string, unknown>) => { receipt.receiptSha256 = `sha256:${'0'.repeat(64)}`; }],
  ])('rejects a %s receipt mutation', (_label, mutate) => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    mutate(receipt);
    overwriteReceipt(root, receipt);
    expect(validateData027Receipt(root)).toBe(false);
  });

  it.each([
    ['reordered manifest', (receipt: Record<string, unknown>) => { (receipt.evidenceInputs as unknown[]).reverse(); }],
    ['missing manifest entry', (receipt: Record<string, unknown>) => { (receipt.evidenceInputs as unknown[]).pop(); }],
    ['extra manifest entry', (receipt: Record<string, unknown>) => { (receipt.evidenceInputs as unknown[]).push({ path: 'extra.ts', sha256: `sha256:${'0'.repeat(64)}` }); }],
    ['different runtime version', (receipt: Record<string, unknown>) => {
      receipt.runtimeVersions = { node: 'v24.17.0', pnpm: '11.13.0' };
    }],
  ])('rejects a %s even when its hashes are internally valid', (_label, mutate) => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    mutate(receipt);
    rehashReceipt(receipt);
    overwriteReceipt(root, receipt);
    expect(validateData027Receipt(root)).toBe(false);
  });

  it.each(['A'.repeat(40), 'a'.repeat(39), 'a'.repeat(41), 'z'.repeat(40)])('rejects an internally rehashed receipt with invalid commitSha %s', (invalidCommitSha) => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    receipt.commitSha = invalidCommitSha;
    rehashReceipt(receipt);
    overwriteReceipt(root, receipt);
    expect(validateData027Receipt(root)).toBe(false);
  });

  it('invalidates byte mutations to every allow-listed input class', () => {
    const root = createRepository();
    const inputs = buildEvidenceInputs(root);
    expect(inputs.map((input) => input.path)).toEqual(expectedEvidencePaths);

    writeData027Receipt(root, validObservation, commitSha);
    for (const input of inputs) {
      const target = join(root, ...input.path.split('/'));
      const original = readFileSync(target);
      try {
        writeFileSync(target, Buffer.concat([original, Buffer.from('!')]));
        expect(validateData027Receipt(root)).toBe(false);
      } finally {
        writeFileSync(target, original);
      }
    }
  }, 30_000);

  it('rejects a missing allow-listed input', () => {
    const root = createRepository();
    rmSync(join(root, 'tools', 'run-supabase-gate.mjs'));
    expect(() => buildEvidenceInputs(root)).toThrow('DATA_027_EVIDENCE_INPUTS_INVALID');
  });

  it('does not validate a receipt reached through a symlinked directory', () => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readFileSync(receiptPath(root));
    const external = join(root, 'external-receipt');
    write(external, 'evidence/data-027/receipt.json', receipt.toString('utf8'));
    rmSync(join(root, '.superpowers'), { recursive: true, force: true });
    symlinkSync(external, join(root, '.superpowers'), 'junction');

    expect(validateData027Receipt(root)).toBe(false);
  });

});
