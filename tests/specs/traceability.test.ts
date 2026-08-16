import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  checkNormativeNumbers,
  checkRepositoryTraceability,
  discoverNormativeRequirements,
  extractNormativeNumericTokens,
  validateGateScripts,
  validateRequirementLifecycle,
} from '../../tools/check-docs-lib.js';
import { validateNonCurrentEvidence } from '../../tools/requirement-oracle.js';

/**
 * Puts a deliberately corrupted repository file back.
 *
 * Windows intermittently answers `UNKNOWN: unknown error, open` here when the just-exited child
 * process still holds the handle. A plain write in a `finally` turns that into a tracked file
 * left carrying the test's sentinel — observed once, and the next commit would have shipped it.
 * Retrying costs nothing on the path that already works.
 */
function restore(file: string, contents: string): void {
  const idle = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.writeFileSync(file, contents);
      return;
    } catch (error) {
      if (attempt >= 40) throw error;
      Atomics.wait(idle, 0, 0, 50);
    }
  }
}

describe('normative traceability', () => {
  it('discovers bullets, ordered requirements and normative prose with stable semantics', () => {
    const text = '# API\n## Mutations\n- Must retry. <!-- REQ: API-002 -->\n1. Tie break. <!-- REQ: API-003 -->\nServer authority is final. <!-- REQ: API-004 -->';
    const rows = discoverNormativeRequirements('09_API.md', text);
    expect(rows.map((x) => x.text)).toEqual(['Must retry.', 'Tie break.', 'Server authority is final.']);
    expect(rows.every((x) => x.fingerprint.match(/^[a-f0-9]{64}$/))).toBe(true);
  });

  it('discovers normative blockquotes and table rows', () => {
    const text = '# Rules\n> Ruleset is authoritative. <!-- REQ: RULE-001 -->\n| action | score |\n|---|---|\n| final | +25 | <!-- REQ: RULE-002 -->';
    expect(discoverNormativeRequirements('02_RULES.md', text).map((x) => x.text)).toEqual(['Ruleset is authoritative.', '| final | +25 |']);
  });

  it('fails unmarked normative bullets and source/fingerprint drift against a copied real registry', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-real-'));
    for (const file of ['README.md', '09_API_AND_SOCKET_EVENTS.md']) fs.copyFileSync(path.resolve(file), path.join(tmp, file));
    fs.mkdirSync(path.join(tmp, 'docs'));
    fs.copyFileSync(path.resolve('docs/requirements-registry.v1.json'), path.join(tmp, 'docs/requirements-registry.v1.json'));
    expect(checkRepositoryTraceability(tmp).unmarked).toEqual([]);
    fs.appendFileSync(path.join(tmp, '09_API_AND_SOCKET_EVENTS.md'), '\n- The server MUST reject drift.\n');
    expect(checkRepositoryTraceability(tmp).unmarked.length).toBe(1);
  });

  it('detects the external soak numeric drift while the registry checker covers local SSOT values', () => {
    const files = { '07_REALTIME_SERVER_SPEC.md': fs.readFileSync('07_REALTIME_SERVER_SPEC.md', 'utf8') };
    expect(checkNormativeNumbers(files)).toEqual([]);
    expect(checkNormativeNumbers({ '07_REALTIME_SERVER_SPEC.md': files['07_REALTIME_SERVER_SPEC.md'].replace('200-match/400-socket 30-minute soak', '201-match/400-socket 30-minute soak') })).toContain('07_REALTIME_SERVER_SPEC.md:200-match/400-socket 30-minute soak');
  });

  it('does not treat the SHA-256 algorithm suffix as a normative value', () => expect(extractNormativeNumericTokens('SHA-256 bijection, 8 MiB')).toEqual(['8']));
  it('ignores semantic versions, mixed code identifiers and technology edition years', () => expect(extractNormativeNumericTokens('Ruleset `1.0.0`, migration `202607150004_economy.sql`, Ajv 2020, limit 75,000')).toEqual(['75,000']));

  it('parses exact package gate composition rather than accepting substrings', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(validateGateScripts(pkg.scripts)).toEqual([]);
    expect(validateGateScripts({ ...pkg.scripts, check: pkg.scripts.check.replace('corepack pnpm docs:check', 'echo corepack pnpm docs:check') })).not.toEqual([]);
  });

  it('fails semantic mapping mutations and ordered/prose omissions in real artifacts', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-map-'));
    for (const file of ['README.md', ...fs.readdirSync('.').filter((x) => /^\d{2}_.+\.md$/.test(x))]) fs.copyFileSync(file, path.join(tmp, file));
    fs.mkdirSync(path.join(tmp, 'docs'));
    const registry = JSON.parse(fs.readFileSync('docs/requirements-registry.v1.json', 'utf8'));
    registry.requirements[0].metric = '';
    fs.writeFileSync(path.join(tmp, 'docs/requirements-registry.v1.json'), JSON.stringify(registry));
    expect(checkRepositoryTraceability(tmp).semantic).toContain(registry.requirements[0].id);
  });

  it('rejects existing but irrelevant schema/test/metric linkage and gate duplicates/additions/order', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-link-'));
    for (const file of ['README.md', ...fs.readdirSync('.').filter((x) => /^\d{2}_.+\.md$/.test(x))]) fs.copyFileSync(file, path.join(tmp, file));
    fs.mkdirSync(path.join(tmp, 'docs'));
    const registry = JSON.parse(fs.readFileSync('docs/requirements-registry.v1.json', 'utf8'));
    registry.requirements[0].schema = registry.requirements.at(-1).schema;
    registry.requirements[0].test = registry.requirements.at(-1).test;
    registry.requirements[0].metric = 'unrelated_metric';
    fs.writeFileSync(path.join(tmp, 'docs/requirements-registry.v1.json'), JSON.stringify(registry));
    expect(checkRepositoryTraceability(tmp).semantic).toContain(registry.requirements[0].id);
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(validateGateScripts({ ...pkg.scripts, check: `${pkg.scripts.check} && corepack pnpm lint` })).not.toEqual([]);
    expect(validateGateScripts({ ...pkg.scripts, check: pkg.scripts.check.replace('corepack pnpm lint && corepack pnpm typecheck', 'corepack pnpm typecheck && corepack pnpm lint') })).not.toEqual([]);
  });

  it('has no fabricated review attestation and labels every oracle result explicitly', () => {
    const registry = JSON.parse(fs.readFileSync('docs/requirements-registry.v1.json', 'utf8'));
    const coverage = JSON.parse(fs.readFileSync('config/requirement-evidence.v1.json', 'utf8'));
    const dictionary = fs.readFileSync('docs/analytics/metric-dictionary.md', 'utf8');
    expect(coverage.approval).toBeUndefined();
    expect(new Set(coverage.entries.map((x: { id: string }) => x.id))).toEqual(new Set(registry.requirements.map((x: { id: string }) => x.id)));
    expect(coverage.entries.every((x: { id: string; oracle: { kind: string; expected: string }; testCase: string; metric: string; blockerReason?: string }) => x.oracle.kind && ['PASS', 'FAIL', 'BLOCKED'].includes(x.oracle.expected) && x.testCase.includes(x.id) && dictionary.includes(x.metric) && (x.oracle.expected !== 'BLOCKED' || /^(?:UNVERIFIED_EXTERNAL_BLOCKER|PLANNED_NOT_IMPLEMENTED|EXTERNAL):/.test(x.blockerReason ?? '')))).toBe(true);
  });

  it('separates locally verified numeric SSOT bindings from unapproved lifecycle blockers', () => {
    const baseline = JSON.parse(fs.readFileSync('config/normative-numeric-approvals.v1.json', 'utf8'));
    expect(baseline.approval).toBeUndefined();
    const verified = baseline.entries.filter((x: { status: string }) => x.status === 'VERIFIED_LOCAL_SSOT');
    const unapproved = baseline.entries.filter((x: { status: string }) => x.status === 'UNAPPROVED_BASELINE');
    expect(verified.length).toBeGreaterThan(0);
    expect(verified.every((x: { ssotPath?: string; ssotAssertions?: unknown[]; ssotHash?: string }) => x.ssotPath && x.ssotAssertions?.length && x.ssotHash?.match(/^[a-f0-9]{64}$/))).toBe(true);
    expect(unapproved.every((x: Record<string, unknown>) => x.lifecycle !== 'CURRENT' && !('reviewer' in x) && !('approvalVersion' in x))).toBe(true);
  });

  it('rejects incomplete lifecycle metadata, CURRENT blockers, and EXTERNAL rows backed by local contracts', () => {
    const good = { id: 'RULE-001', lifecycle: 'CURRENT' as const, oracle: { expected: 'PASS' }, evidenceOwner: 'rules', phase: 'A', closureCondition: 'parser passes', schema: 'packages/contracts/src/rules.schema.ts' };
    expect(validateRequirementLifecycle(process.cwd(), [good])).toEqual([]);
    expect(validateRequirementLifecycle(process.cwd(), [{ ...good, oracle: { expected: 'FAIL' } }])).toEqual([]);
    expect(validateRequirementLifecycle(process.cwd(), [{ ...good, oracle: { expected: 'BLOCKED' } }])).toContain('RULE-001:current-blocked');
    expect(validateRequirementLifecycle(process.cwd(), [{ ...good, lifecycle: 'EXTERNAL', oracle: { expected: 'BLOCKED' } }])).toContain('RULE-001:external-local-schema');
    expect(validateRequirementLifecycle(process.cwd(), [{ ...good, lifecycle: 'PLANNED', closureCondition: '' }])).toContain('RULE-001:incomplete-lifecycle');
  });

  it('executes planned closure absence and external-kind evidence instead of trusting blocker text', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-'));
    const planned = { lifecycle: 'PLANNED', closureCondition: 'add contract', closureArtifact: 'future.test.ts', closureArtifactState: 'ABSENT' } as const;
    expect(validateNonCurrentEvidence(root, planned)).toBe(true);
    fs.writeFileSync(path.join(root, 'future.test.ts'), 'premature');
    expect(validateNonCurrentEvidence(root, planned)).toBe(false);
    expect(validateNonCurrentEvidence(root, { lifecycle: 'EXTERNAL', closureCondition: 'device run', externalKind: 'DEVICE_GOLDEN', localSubstitute: 'device-golden.json' })).toBe(true);
    expect(validateNonCurrentEvidence(root, { lifecycle: 'EXTERNAL', closureCondition: 'fake', externalKind: 'UNKNOWN', localSubstitute: 'x' })).toBe(false);
  });

  it('fails a stale generated release report without mutating shared repository evidence', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-report-'));
    for (const file of ['docs/testing/reports/match-bot-v1-seed-20260719.json', 'docs/testing/reports/economy-draw-v1-seed-20260719.json']) {
      const target = path.join(tmp, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file, target);
    }
    const economy = path.join(tmp, 'docs/testing/reports/economy-draw-v1-seed-20260719.json');
    fs.writeFileSync(economy, fs.readFileSync(economy, 'utf8').replace('100000', '99999'));
    const result = spawnSync(process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), 'tools/write-release-reports.ts', '--check', `--report-root=${tmp}`], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('stale report');
  }, 15_000);

  it('makes recurring docs check fail for a stale blocker report', () => {
    // Neither check-docs.mjs nor write-release-blockers.mjs takes a root override — both read
    // the report from a hard-coded relative path — so unlike the case above this one has to
    // stage the staleness in the working tree and put it back afterwards.
    const file = 'docs/testing/reports/release-blockers.v1.json';
    const original = fs.readFileSync(file, 'utf8');
    try {
      fs.writeFileSync(file, original.replace('"schemaVersion": 1', '"schemaVersion": 99'));
      const result = spawnSync(process.execPath, ['tools/check-docs.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('release-blockers.v1.json');
    } finally {
      restore(file, original);
    }
  }, 10_000);

  it('recurring docs checker includes numeric, inventory, and relative-link drift in the executable failure set', () => {
    const checker = fs.readFileSync('tools/check-docs.mjs', 'utf8');
    for (const signal of ['numericApprovalDrift', 'inventoryDrift', 'linkBroken']) {
      expect(checker).toContain(signal);
      expect(checker).toMatch(new RegExp(`failures=.*${signal}`, 's'));
    }
  });
});
