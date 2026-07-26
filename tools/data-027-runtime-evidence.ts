import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../packages/contracts/src/canonical-json.js';

export const DATA_027_RECEIPT_RELATIVE_PATH =
  '.superpowers/evidence/data-027/receipt.json';
export const DATA_027_PUBLICATION_LOCK_RELATIVE_PATH =
  '.superpowers/evidence/data-027/publication.lock';

export type Data027Observation = Readonly<{
  schemaVersion: 1;
  gateRunId: string;
  requirementId: 'DATA-027';
  sessionsAttempted: 20;
  successfulSeats: 2;
  requiredRole: 'app_server';
  databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE';
  testStatus: 'PASS';
}>;

export type EvidenceInput = Readonly<{
  path: string;
  sha256: `sha256:${string}`;
}>;

export type Data027RuntimeVersions = Readonly<{
  node: `v${string}`;
  pnpm: string;
}>;

export type Data027EvidenceManifest = Readonly<{
  evidenceInputs: readonly EvidenceInput[];
  evidenceInputsSha256: `sha256:${string}`;
  runtimeVersions: Data027RuntimeVersions;
}>;

type Data027Receipt = Readonly<{
  schemaVersion: 1;
  requirementId: 'DATA-027';
  scope: 'LOCAL_DETERMINISTIC_NOT_PRODUCTION';
  commitSha: string;
  evidenceInputs: readonly EvidenceInput[];
  evidenceInputsSha256: `sha256:${string}`;
  runtimeVersions: Data027RuntimeVersions;
  sessionsAttempted: 20;
  successfulSeats: 2;
  requiredRole: 'app_server';
  databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE';
  testStatus: 'PASS';
  receiptSha256: `sha256:${string}`;
}>;

const observationKeys = [
  'schemaVersion',
  'gateRunId',
  'requirementId',
  'sessionsAttempted',
  'successfulSeats',
  'requiredRole',
  'databaseOrigin',
  'testStatus',
] as const;

const receiptKeys = [
  'schemaVersion',
  'requirementId',
  'scope',
  'commitSha',
  'evidenceInputs',
  'evidenceInputsSha256',
  'runtimeVersions',
  'sessionsAttempted',
  'successfulSeats',
  'requiredRole',
  'databaseOrigin',
  'testStatus',
  'receiptSha256',
] as const;

const evidenceInputKeys = ['path', 'sha256'] as const;
const runtimeVersionKeys = ['node', 'pnpm'] as const;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const commitShaPattern = /^[a-f0-9]{40}$/u;

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
  'pnpm-workspace.yaml',
  'schemas/economy.schema.json',
  'schemas/pet-catalog.schema.json',
  'schemas/ruleset.schema.json',
  'tsconfig.json',
] as const;

const hashBytes = (value: Uint8Array): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const hashCanonicalJson = (value: unknown): `sha256:${string}` =>
  hashBytes(Buffer.from(canonicalJson(value), 'utf8'));

const isExactObject = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const repositoryTopLevel = (root: string): string =>
  path.resolve(execFileSync('git', ['-C', path.resolve(root), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true }).trim());

const relativeInputPath = (root: string, absolutePath: string): string =>
  path.relative(root, absolutePath).split(path.sep).join('/');

const filesRecursively = (
  root: string,
  directory: string,
  acceptedExtensions: ReadonlySet<string>,
): readonly string[] => {
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) {
    throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
  }
  const discovered: string[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        if (acceptedExtensions.has(path.extname(entry.name))) {
          discovered.push(relativeInputPath(root, absolutePath));
        }
      } else {
        throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
      }
    }
  };
  visit(directory);
  return discovered.sort();
};

const evidenceInputPaths = (root: string): readonly string[] => {
  const migrationsDirectory = path.join(root, 'supabase', 'migrations');
  if (!existsSync(migrationsDirectory)) throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
  const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.sql'))
    .map((entry) => {
      if (!entry.isFile()) throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
      return relativeInputPath(root, path.join(migrationsDirectory, entry.name));
    })
    .sort();
  const databaseTests = filesRecursively(
    root,
    path.join(root, 'supabase', 'tests'),
    new Set(['.inc', '.sql']),
  );
  return [...new Set([
    ...migrations,
    ...databaseTests,
    ...concurrencyDependencyPaths,
    'package.json',
    'pnpm-lock.yaml',
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
  ])].sort();
};

export function buildEvidenceInputs(root: string): readonly EvidenceInput[] {
  let topLevel: string;
  try {
    topLevel = repositoryTopLevel(root);
  } catch {
    throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
  }
  try {
    return evidenceInputPaths(topLevel).map((relativePath) => {
      const absolutePath = path.resolve(topLevel, ...relativePath.split('/'));
      if (!isPathBelow(topLevel, absolutePath) || !existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
        throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
      }
      return { path: relativePath, sha256: hashBytes(readFileSync(absolutePath)) };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DATA_027_EVIDENCE_INPUTS_INVALID') throw error;
    throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
  }
}

const expectedRuntimeVersions = (root: string): Data027RuntimeVersions => {
  try {
    const packageJson = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as {
      packageManager?: unknown;
      engines?: { node?: unknown; pnpm?: unknown };
    };
    const node = packageJson.engines?.node;
    const pnpm = packageJson.engines?.pnpm;
    const packageManagerMatch = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(
      typeof packageJson.packageManager === 'string'
        ? packageJson.packageManager
        : '',
    );
    if (
      typeof node !== 'string'
      || !/^\d+\.\d+\.\d+$/u.test(node)
      || typeof pnpm !== 'string'
      || !/^\d+\.\d+\.\d+$/u.test(pnpm)
      || packageManagerMatch?.[1] !== pnpm
    ) {
      throw new Error('invalid runtime pin');
    }
    return { node: `v${node}`, pnpm };
  } catch {
    throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
  }
};

export function buildData027EvidenceManifest(
  root: string,
): Data027EvidenceManifest {
  let topLevel: string;
  try {
    topLevel = repositoryTopLevel(root);
  } catch {
    throw new Error('DATA_027_EVIDENCE_INPUTS_INVALID');
  }
  const evidenceInputs = buildEvidenceInputs(topLevel);
  const runtimeVersions = expectedRuntimeVersions(topLevel);
  return {
    evidenceInputs,
    runtimeVersions,
    evidenceInputsSha256: hashCanonicalJson({
      evidenceInputs,
      runtimeVersions,
    }),
  };
}

export function validateData027Observation(value: unknown, expectedGateRunId: string): Data027Observation {
  if (
    !isExactObject(value, observationKeys)
    || typeof value.gateRunId !== 'string'
    || value.gateRunId.length === 0
    || value.gateRunId !== expectedGateRunId
    || value.schemaVersion !== 1
    || value.requirementId !== 'DATA-027'
    || value.sessionsAttempted !== 20
    || value.successfulSeats !== 2
    || value.requiredRole !== 'app_server'
    || value.databaseOrigin !== 'LOOPBACK_LOCAL_SUPABASE'
    || value.testStatus !== 'PASS'
  ) throw new Error('DATA_027_OBSERVATION_INVALID');
  return value as Data027Observation;
}

const isEvidenceInput = (value: unknown): value is EvidenceInput =>
  isExactObject(value, evidenceInputKeys)
  && typeof value.path === 'string'
  && value.path.length > 0
  && !value.path.includes('\\')
  && !value.path.startsWith('/')
  && !value.path.split('/').includes('..')
  && typeof value.sha256 === 'string'
  && sha256Pattern.test(value.sha256);

const isRuntimeVersions = (
  value: unknown,
): value is Data027RuntimeVersions =>
  isExactObject(value, runtimeVersionKeys)
  && typeof value.node === 'string'
  && /^v\d+\.\d+\.\d+$/u.test(value.node)
  && typeof value.pnpm === 'string'
  && /^\d+\.\d+\.\d+$/u.test(value.pnpm);

const isData027Receipt = (value: unknown): value is Data027Receipt =>
  isExactObject(value, receiptKeys)
  && value.schemaVersion === 1
  && value.requirementId === 'DATA-027'
  && value.scope === 'LOCAL_DETERMINISTIC_NOT_PRODUCTION'
  && typeof value.commitSha === 'string'
  && commitShaPattern.test(value.commitSha)
  && Array.isArray(value.evidenceInputs)
  && value.evidenceInputs.every(isEvidenceInput)
  && typeof value.evidenceInputsSha256 === 'string'
  && sha256Pattern.test(value.evidenceInputsSha256)
  && isRuntimeVersions(value.runtimeVersions)
  && value.sessionsAttempted === 20
  && value.successfulSeats === 2
  && value.requiredRole === 'app_server'
  && value.databaseOrigin === 'LOOPBACK_LOCAL_SUPABASE'
  && value.testStatus === 'PASS'
  && typeof value.receiptSha256 === 'string'
  && sha256Pattern.test(value.receiptSha256);

const receiptWithoutHash = (receipt: Data027Receipt): Omit<Data027Receipt, 'receiptSha256'> => {
  const { receiptSha256: _receiptSha256, ...payload } = receipt;
  return payload;
};

const isPathBelow = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

const receiptTarget = (root: string): { topLevel: string; target: string } => {
  const topLevel = repositoryTopLevel(root);
  const target = path.resolve(topLevel, ...DATA_027_RECEIPT_RELATIVE_PATH.split('/'));
  if (!isPathBelow(topLevel, target)) throw new Error('DATA_027_RECEIPT_PATH_INVALID');
  return { topLevel, target };
};

const hasSafeReceiptDirectory = (topLevel: string, target: string): boolean => {
  let current = topLevel;
  for (const component of DATA_027_RECEIPT_RELATIVE_PATH.split('/').slice(0, -1)) {
    current = path.join(current, component);
    if (!existsSync(current)) return false;
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  }
  return path.dirname(target) === current;
};

type PublicationLock = Readonly<{
  descriptor: number;
  lockPath: string;
}>;

const acquireValidationPublicationLock = (
  target: string,
): PublicationLock | undefined => {
  const lockPath = path.join(
    path.dirname(target),
    path.basename(DATA_027_PUBLICATION_LOCK_RELATIVE_PATH),
  );
  try {
    return {
      descriptor: openSync(lockPath, 'wx', 0o600),
      lockPath,
    };
  } catch {
    return undefined;
  }
};

const releaseValidationPublicationLock = (
  lock: PublicationLock,
): boolean => {
  try {
    closeSync(lock.descriptor);
  } catch {
    return false;
  }
  try {
    rmSync(lock.lockPath);
    return true;
  } catch {
    return false;
  }
};

const validateData027ReceiptWhileLocked = (
  root: string,
  target: string,
): boolean => {
  if (!existsSync(target)) return false;
  const targetStat = lstatSync(target);
  if (targetStat.isSymbolicLink() || !targetStat.isFile()) return false;
  const receipt = JSON.parse(readFileSync(target, 'utf8')) as unknown;
  if (!isData027Receipt(receipt)) return false;
  if (
    receipt.receiptSha256
    !== hashCanonicalJson(receiptWithoutHash(receipt))
  ) return false;
  const manifest = buildData027EvidenceManifest(root);
  if (
    canonicalJson(receipt.evidenceInputs)
    !== canonicalJson(manifest.evidenceInputs)
  ) return false;
  if (
    canonicalJson(receipt.runtimeVersions)
    !== canonicalJson(manifest.runtimeVersions)
  ) return false;
  return receipt.evidenceInputsSha256 === manifest.evidenceInputsSha256;
};

export function validateData027Receipt(root: string): boolean {
  let lock: PublicationLock | undefined;
  let valid = false;
  try {
    const { topLevel, target } = receiptTarget(root);
    if (!hasSafeReceiptDirectory(topLevel, target)) return false;
    lock = acquireValidationPublicationLock(target);
    if (lock === undefined) return false;
    valid = validateData027ReceiptWhileLocked(root, target);
  } catch {
    valid = false;
  } finally {
    if (lock !== undefined && !releaseValidationPublicationLock(lock)) {
      valid = false;
    }
  }
  return valid;
}
