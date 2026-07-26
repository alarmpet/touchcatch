import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../packages/contracts/src/canonical-json.js';

export const DATA_027_RECEIPT_RELATIVE_PATH =
  '.superpowers/evidence/data-027/receipt.json';

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

type Data027Receipt = Readonly<{
  schemaVersion: 1;
  requirementId: 'DATA-027';
  scope: 'LOCAL_DETERMINISTIC_NOT_PRODUCTION';
  commitSha: string;
  evidenceInputs: readonly EvidenceInput[];
  evidenceInputsSha256: `sha256:${string}`;
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
  'sessionsAttempted',
  'successfulSeats',
  'requiredRole',
  'databaseOrigin',
  'testStatus',
  'receiptSha256',
] as const;

const evidenceInputKeys = ['path', 'sha256'] as const;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const commitShaPattern = /^[a-f0-9]{40}$/u;

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
  return [
    ...migrations,
    'tests/database/concurrency.test.ts',
    'vitest.db.config.ts',
    'tools/run-supabase-gate.mjs',
    'tools/data-027-runtime-evidence.ts',
    'tools/requirement-oracle.ts',
  ].sort();
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

const createReceiptDirectory = (topLevel: string, target: string): void => {
  let current = topLevel;
  for (const component of DATA_027_RECEIPT_RELATIVE_PATH.split('/').slice(0, -1)) {
    current = path.join(current, component);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('DATA_027_RECEIPT_PATH_INVALID');
    } else {
      mkdirSync(current);
    }
  }
  if (path.dirname(target) !== current) throw new Error('DATA_027_RECEIPT_PATH_INVALID');
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

export function writeData027Receipt(root: string, observation: Data027Observation, commitSha: string): void {
  validateData027Observation(observation, observation.gateRunId);
  if (!commitShaPattern.test(commitSha)) throw new Error('DATA_027_RECEIPT_INVALID');

  let location: { topLevel: string; target: string };
  try {
    location = receiptTarget(root);
    createReceiptDirectory(location.topLevel, location.target);
  } catch (error) {
    if (error instanceof Error && error.message === 'DATA_027_RECEIPT_PATH_INVALID') throw error;
    throw new Error('DATA_027_RECEIPT_PATH_INVALID');
  }

  const evidenceInputs = buildEvidenceInputs(location.topLevel);
  const payload = {
    schemaVersion: 1 as const,
    requirementId: 'DATA-027' as const,
    scope: 'LOCAL_DETERMINISTIC_NOT_PRODUCTION' as const,
    commitSha,
    evidenceInputs,
    evidenceInputsSha256: hashCanonicalJson(evidenceInputs),
    sessionsAttempted: 20 as const,
    successfulSeats: 2 as const,
    requiredRole: 'app_server' as const,
    databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE' as const,
    testStatus: 'PASS' as const,
  };
  const receipt: Data027Receipt = { ...payload, receiptSha256: hashCanonicalJson(payload) };
  const temporaryPath = path.join(path.dirname(location.target), `.data-027-receipt-${randomBytes(16).toString('hex')}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, 'wx', 0o600);
    writeSync(descriptor, canonicalJson(receipt), undefined, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, location.target);
  } catch {
    throw new Error('DATA_027_RECEIPT_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // The public error is intentionally sanitized below.
      }
    }
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // A failed cleanup must not reveal a personal filesystem path.
    }
  }
}

export function validateData027Receipt(root: string): boolean {
  try {
    const { topLevel, target } = receiptTarget(root);
    if (!hasSafeReceiptDirectory(topLevel, target)) return false;
    if (!existsSync(target)) return false;
    const targetStat = lstatSync(target);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) return false;
    const receipt = JSON.parse(readFileSync(target, 'utf8')) as unknown;
    if (!isData027Receipt(receipt)) return false;
    if (receipt.receiptSha256 !== hashCanonicalJson(receiptWithoutHash(receipt))) return false;
    const evidenceInputs = buildEvidenceInputs(root);
    if (canonicalJson(receipt.evidenceInputs) !== canonicalJson(evidenceInputs)) return false;
    if (receipt.evidenceInputsSha256 !== hashCanonicalJson(evidenceInputs)) return false;
    return true;
  } catch {
    return false;
  }
}
