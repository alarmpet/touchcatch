import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DATA_027_RECEIPT_RELATIVE_PATH,
  buildEvidenceInputs,
  validateData027Observation,
  validateData027Receipt,
  writeData027Receipt,
  type Data027Observation,
} from '../../tools/data-027-runtime-evidence.js';

const roots: string[] = [];

const validObservation: Data027Observation = {
  schemaVersion: 1,
  gateRunId: 'run-a',
  requirementId: 'DATA-027',
  sessionsAttempted: 20,
  successfulSeats: 2,
  requiredRole: 'app_server',
  databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE',
  testStatus: 'PASS',
};

const commitSha = 'a'.repeat(40);

const write = (root: string, relativePath: string, content = relativePath): void => {
  const target = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};

const createRepository = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'data-027-evidence-'));
  roots.push(root);
  execFileSync('git', ['init', '--quiet', root]);
  write(root, 'supabase/migrations/202607260001_schema.sql', 'create table evidence ();');
  write(root, 'supabase/migrations/202607260010_schema.sql', 'create table evidence_more ();');
  for (const file of [
    'tests/database/concurrency.test.ts',
    'vitest.db.config.ts',
    'tools/run-supabase-gate.mjs',
    'tools/data-027-runtime-evidence.ts',
    'tools/requirement-oracle.ts',
  ]) write(root, file);
  return root;
};

const receiptPath = (root: string): string => join(root, ...DATA_027_RECEIPT_RELATIVE_PATH.split('/'));

const readReceipt = (root: string): Record<string, unknown> => JSON.parse(readFileSync(receiptPath(root), 'utf8')) as Record<string, unknown>;

const overwriteReceipt = (root: string, value: unknown): void => writeFileSync(receiptPath(root), JSON.stringify(value));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('DATA-027 runtime evidence', () => {
  it('accepts only the exact runtime observation contract', () => {
    expect(() => validateData027Observation(validObservation, 'run-a')).not.toThrow();

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
      expect(() => validateData027Observation(value, 'run-a')).toThrow('DATA_027_OBSERVATION_INVALID');
    }
  });

  it('writes a canonical, fresh receipt and ignores commit-only provenance changes', () => {
    const root = createRepository();
    expect(validateData027Receipt(root)).toBe(false);

    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    expect(Object.keys(receipt).sort()).toEqual([
      'commitSha', 'databaseOrigin', 'evidenceInputs', 'evidenceInputsSha256', 'receiptSha256',
      'requiredRole', 'requirementId', 'schemaVersion', 'scope', 'sessionsAttempted',
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

  it('writes only beneath the caller repository Git top-level', () => {
    const root = createRepository();
    const nestedPath = join(root, 'nested', 'caller-path');
    mkdirSync(nestedPath, { recursive: true });

    writeData027Receipt(nestedPath, validObservation, commitSha);

    expect(existsSync(receiptPath(root))).toBe(true);
    expect(existsSync(join(nestedPath, ...DATA_027_RECEIPT_RELATIVE_PATH.split('/')))).toBe(false);
  });

  it('uses an exact receipt path that cannot escape its Git top-level', () => {
    const root = createRepository();
    expect(DATA_027_RECEIPT_RELATIVE_PATH).toBe('.superpowers/evidence/data-027/receipt.json');
    expect(DATA_027_RECEIPT_RELATIVE_PATH.split('/')).not.toContain('..');
    writeData027Receipt(root, validObservation, commitSha);
    expect(existsSync(receiptPath(root))).toBe(true);
  });

  it.each([
    ['missing key', (receipt: Record<string, unknown>) => { delete receipt.testStatus; }],
    ['extra secret-like key', (receipt: Record<string, unknown>) => { receipt.token = 'secret'; }],
    ['wrong type', (receipt: Record<string, unknown>) => { receipt.sessionsAttempted = '20'; }],
    ['wrong acceptance value', (receipt: Record<string, unknown>) => { receipt.successfulSeats = 3; }],
    ['wrong payload hash', (receipt: Record<string, unknown>) => { receipt.receiptSha256 = `sha256:${'0'.repeat(64)}`; }],
    ['reordered manifest', (receipt: Record<string, unknown>) => { (receipt.evidenceInputs as unknown[]).reverse(); }],
    ['missing manifest entry', (receipt: Record<string, unknown>) => { (receipt.evidenceInputs as unknown[]).pop(); }],
    ['extra manifest entry', (receipt: Record<string, unknown>) => { (receipt.evidenceInputs as unknown[]).push({ path: 'extra.ts', sha256: `sha256:${'0'.repeat(64)}` }); }],
  ])('rejects a %s receipt mutation', (_label, mutate) => {
    const root = createRepository();
    writeData027Receipt(root, validObservation, commitSha);
    const receipt = readReceipt(root);
    mutate(receipt);
    overwriteReceipt(root, receipt);
    expect(validateData027Receipt(root)).toBe(false);
  });

  it('invalidates byte mutations to every allow-listed input class', () => {
    const root = createRepository();
    const inputs = buildEvidenceInputs(root);
    expect(inputs.map((input) => input.path)).toEqual([
      'supabase/migrations/202607260001_schema.sql',
      'supabase/migrations/202607260010_schema.sql',
      'tests/database/concurrency.test.ts',
      'tools/data-027-runtime-evidence.ts',
      'tools/requirement-oracle.ts',
      'tools/run-supabase-gate.mjs',
      'vitest.db.config.ts',
    ]);

    for (const input of inputs) {
      writeData027Receipt(root, validObservation, commitSha);
      const target = join(root, ...input.path.split('/'));
      writeFileSync(target, `${readFileSync(target, 'utf8')}!`);
      expect(validateData027Receipt(root)).toBe(false);
    }
  });

  it('rejects a missing allow-listed input', () => {
    const root = createRepository();
    rmSync(join(root, 'tools', 'run-supabase-gate.mjs'));
    expect(() => buildEvidenceInputs(root)).toThrow('DATA_027_EVIDENCE_INPUTS_INVALID');
  });

  it('rejects a symlink in every existing receipt-directory component', () => {
    const root = createRepository();
    const components = ['.superpowers', 'evidence', 'data-027'];
    for (let index = 0; index < components.length; index += 1) {
      const parent = join(root, ...components.slice(0, index));
      mkdirSync(parent, { recursive: true });
      const link = join(parent, components[index]!);
      const target = join(root, `outside-${index}`);
      mkdirSync(target);
      symlinkSync(target, link, 'junction');
      expect(() => writeData027Receipt(root, validObservation, commitSha)).toThrow('DATA_027_RECEIPT_PATH_INVALID');
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      rmSync(join(root, '.superpowers'), { recursive: true, force: true });
    }
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

  it('atomically replaces an existing receipt and leaves no partial temporary file', () => {
    const root = createRepository();
    const directory = dirname(receiptPath(root));
    mkdirSync(directory, { recursive: true });
    writeFileSync(receiptPath(root), 'incomplete');

    writeData027Receipt(root, validObservation, commitSha);

    expect(validateData027Receipt(root)).toBe(true);
    expect(existsSync(receiptPath(root))).toBe(true);
    expect(readdirSync(directory).some((entry) => entry.includes('data-027-receipt-'))).toBe(false);
  });

  it('cleans up a partial temporary file when atomic replacement fails', () => {
    const root = createRepository();
    const directory = dirname(receiptPath(root));
    mkdirSync(receiptPath(root), { recursive: true });

    let failure: unknown;
    try {
      writeData027Receipt(root, validObservation, commitSha);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(new Error('DATA_027_RECEIPT_WRITE_FAILED'));
    expect((failure as Error).message).not.toContain(root);
    expect(readdirSync(directory).some((entry) => entry.includes('data-027-receipt-'))).toBe(false);
  });
});
