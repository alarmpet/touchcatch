import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonicalJson } from '../../packages/contracts/src/canonical-json.js';
import {
  DATA_027_RECEIPT_RELATIVE_PATH,
  buildData027EvidenceManifest,
} from '../../tools/data-027-runtime-evidence.js';

const hashCanonicalJson = (value: unknown): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;

const fixedEvidencePaths = [
  'package.json',
  'packages/contracts/src/canonical-json.ts',
  'pnpm-lock.yaml',
  'supabase/config.toml',
  'supabase/roles.sql',
  'tests/database/concurrency.test.ts',
  'tests/support/data-027-observation.ts',
  'tests/support/local-supabase-status.ts',
  'tools/check-runtime.mjs',
  'tools/data-027-runtime-evidence.ts',
  'tools/internal/run-supabase-gate-core.mjs',
  'tools/requirement-oracle.ts',
  'tools/run-pnpm.mjs',
  'tools/run-supabase-gate.mjs',
  'vitest.db.config.ts',
] as const;

const assertTemporaryRepository = (root: string): string => {
  const resolvedRoot = path.resolve(root);
  const temporaryRoot = path.resolve(tmpdir());
  const relative = path.relative(temporaryRoot, resolvedRoot);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    throw new Error('DATA_027_TEST_FIXTURE_REQUIRES_TEMP_REPOSITORY');
  }
  return resolvedRoot;
};

export function createData027TestRepository(
  sourceRoot: string,
  sourceProjection?: string,
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'data-027-test-repository-'));
  execFileSync('git', ['init', '--quiet', root]);
  for (const directory of ['supabase/migrations', 'supabase/tests']) {
    const source = path.join(sourceRoot, ...directory.split('/'));
    const target = path.join(root, ...directory.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, errorOnExist: true });
  }
  const paths = new Set<string>(fixedEvidencePaths);
  if (sourceProjection !== undefined) paths.add(sourceProjection);
  for (const relativePath of paths) {
    const source = path.join(sourceRoot, ...relativePath.split('/'));
    const target = path.join(root, ...relativePath.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  return root;
}

/**
 * Writes a deliberately synthetic receipt only inside an OS-temp test
 * repository. Production code must never import this fixture.
 */
export function writeData027ReceiptFixture(
  root: string,
  commitSha = 'a'.repeat(40),
): string {
  const temporaryRepository = assertTemporaryRepository(root);
  const manifest = buildData027EvidenceManifest(temporaryRepository);
  const payload = {
    schemaVersion: 1 as const,
    requirementId: 'DATA-027' as const,
    scope: 'LOCAL_DETERMINISTIC_NOT_PRODUCTION' as const,
    commitSha,
    evidenceInputs: manifest.evidenceInputs,
    evidenceInputsSha256: manifest.evidenceInputsSha256,
    runtimeVersions: manifest.runtimeVersions,
    sessionsAttempted: 20 as const,
    successfulSeats: 2 as const,
    requiredRole: 'app_server' as const,
    databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE' as const,
    testStatus: 'PASS' as const,
  };
  const receipt = {
    ...payload,
    receiptSha256: hashCanonicalJson(payload),
  };
  const target = path.join(
    temporaryRepository,
    ...DATA_027_RECEIPT_RELATIVE_PATH.split('/'),
  );
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, canonicalJson(receipt), { mode: 0o600 });
  return target;
}
