import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = path.resolve('tools/write-normative-approvals.mjs');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'normative-approvals-'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.mkdirSync(path.join(root, 'docs'));
  const source = '# Requirements\n- 20 sessions allow exactly 2 seats. <!-- REQ: DATA-027 -->\n- A 1:1 mode stays planned. <!-- REQ: RULE-013 -->\n';
  const ssot = JSON.stringify({ entries: [{ oracle: { expected: 'PASS' } }] }, null, 2) + '\n';
  fs.writeFileSync(path.join(root, '08_DATABASE_SCHEMA.md'), source);
  fs.writeFileSync(path.join(root, 'config/requirement-evidence.v1.json'), ssot);
  fs.writeFileSync(path.join(root, 'docs/requirements-registry.v1.json'), JSON.stringify({
    requirements: [
      { id: 'DATA-027', source: '08_DATABASE_SCHEMA.md', text: '20 sessions allow exactly 2 seats.' },
      { id: 'RULE-013', source: '08_DATABASE_SCHEMA.md', text: 'A 1:1 mode stays planned.' },
    ],
  }, null, 2) + '\n');
  const manifest = {
    schemaVersion: 4,
    entries: [
      {
        id: 'DATA-027',
        approvedTokens: ['stale'],
        status: 'VERIFIED_LOCAL_SSOT',
        lifecycle: 'CURRENT',
        evidenceOwner: 'database',
        closureCondition: 'Keep reviewed concurrency evidence green',
        ssotPath: 'config/requirement-evidence.v1.json',
        ssotHash: 'stale',
        ssotAssertions: [{ pointer: '/entries/0/oracle/expected', expected: 'PASS' }],
      },
      {
        id: 'RULE-013',
        approvedTokens: ['stale'],
        status: 'UNAPPROVED_BASELINE',
        lifecycle: 'PLANNED',
        evidenceOwner: 'matchmaking',
        closureCondition: 'Implement production matchmaking',
        blockerReason: 'PLANNED_NOT_IMPLEMENTED:NO_PRODUCTION_MATCHMAKING_PATH',
        sourcePath: 'stale.md',
        sourceHash: 'stale',
      },
    ],
    status: 'MIXED_VERIFIED_AND_UNAPPROVED',
    summary: { verifiedLocalSsot: 0, unapproved: 0 },
  };
  fs.writeFileSync(path.join(root, 'config/normative-numeric-approvals.v1.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { root, manifestPath: path.join(root, 'config/normative-numeric-approvals.v1.json'), source, ssot };
}

const run = (root: string, mode: '--check' | '--write') => spawnSync(process.execPath, [script, mode], { cwd: root, encoding: 'utf8' });

describe('normative approval projection generator', () => {
  it('writes only reviewed token/hash/summary projections without promoting status or lifecycle', () => {
    const { root, manifestPath, source, ssot } = fixture();
    const before = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(run(root, '--write').status).toBe(0);
    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(after.entries[0]).toMatchObject({
      approvedTokens: ['20', '2'],
      status: 'VERIFIED_LOCAL_SSOT',
      lifecycle: 'CURRENT',
      ssotHash: hash(ssot),
      ssotAssertions: before.entries[0].ssotAssertions,
    });
    expect(after.entries[1]).toMatchObject({
      approvedTokens: ['1', '1'],
      status: 'UNAPPROVED_BASELINE',
      lifecycle: 'PLANNED',
      blockerReason: 'PLANNED_NOT_IMPLEMENTED:NO_PRODUCTION_MATCHMAKING_PATH',
      sourcePath: '08_DATABASE_SCHEMA.md',
      sourceHash: hash(source),
    });
    expect(after.summary).toEqual({ verifiedLocalSsot: 1, unapproved: 1 });
    expect(run(root, '--check').status).toBe(0);
  });

  it.each([
    ['sourceHash', (manifest: any) => { manifest.entries[1].sourceHash = 'stale'; }],
    ['ssotHash', (manifest: any) => { manifest.entries[0].ssotHash = 'stale'; }],
    ['summary', (manifest: any) => { manifest.summary.unapproved = 0; }],
  ])('fails --check for stale %s projection', (_label, mutate) => {
    const { root, manifestPath } = fixture();
    expect(run(root, '--write').status).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    mutate(manifest);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    expect(run(root, '--check')).toMatchObject({ status: 1 });
  });
});
