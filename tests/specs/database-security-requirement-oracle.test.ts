import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DATA_027_RECEIPT_RELATIVE_PATH,
  writeData027Receipt,
  type Data027Observation,
} from '../../tools/data-027-runtime-evidence.js';
import {
  evaluateDatabaseRequirement,
  executeRequirementOracle,
  expectRoleMembershipLifecycle,
} from '../../tools/requirement-oracle.js';

const root = process.cwd();
const sql = fs.readdirSync(`${root}/supabase/migrations`)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(`${root}/supabase/migrations/${name}`, 'utf8'))
  .join('\n');
const source = {
  sql,
  config: fs.readFileSync(`${root}/supabase/config.toml`, 'utf8'),
  roles: fs.readFileSync(`${root}/supabase/roles.sql`, 'utf8'),
};
const registry = JSON.parse(fs.readFileSync(`${root}/docs/requirements-registry.v1.json`, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(`${root}/config/requirement-evidence.v1.json`, 'utf8'));
const data027Row = registry.requirements.find((row: { id: string }) => row.id === 'DATA-027');
const data027Claim = evidence.entries.find((claim: { id: string }) => claim.id === 'DATA-027');
const runtimeRoots: string[] = [];
const observation: Data027Observation = {
  schemaVersion: 1,
  gateRunId: 'oracle-test',
  requirementId: 'DATA-027',
  sessionsAttempted: 20,
  successfulSeats: 2,
  requiredRole: 'app_server',
  databaseOrigin: 'LOOPBACK_LOCAL_SUPABASE',
  testStatus: 'PASS',
};

const write = (targetRoot: string, relativePath: string, content: string): void => {
  const target = path.join(targetRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

const createRuntimeRoot = (): string => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'data-027-oracle-'));
  runtimeRoots.push(targetRoot);
  execFileSync('git', ['init', '--quiet', targetRoot]);
  write(targetRoot, data027Row.source, fs.readFileSync(path.join(root, data027Row.source), 'utf8'));
  write(targetRoot, 'supabase/migrations/202607260001_schema.sql', 'create table evidence ();');
  for (const file of [
    'tests/database/concurrency.test.ts',
    'vitest.db.config.ts',
    'tools/run-supabase-gate.mjs',
    'tools/data-027-runtime-evidence.ts',
    'tools/requirement-oracle.ts',
  ]) write(targetRoot, file, file);
  return targetRoot;
};

const executeData027 = (targetRoot: string) =>
  executeRequirementOracle(targetRoot, data027Row, data027Claim);

afterEach(() => {
  for (const targetRoot of runtimeRoots.splice(0)) {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

describe('database security requirement oracle', () => {
  it('DATA-012 parses exact role-membership lifecycle evidence', () =>
    expect(() => evaluateDatabaseRequirement('DATA-012')).not.toThrow());

  it('rejects DATA-012 duplicate or incomplete role membership lifecycles', () => {
    const options = { role: 'game_security_owner', member: 'postgres', grantCount: 1, revokeCount: 1 };
    expect(() => expectRoleMembershipLifecycle(
      'GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres;',
      options,
    )).not.toThrow();
    expect(() => expectRoleMembershipLifecycle(
      'GRANT game_security_owner TO postgres; GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres;',
      options,
    )).toThrow(/lifecycle/);
    expect(() => expectRoleMembershipLifecycle('GRANT game_security_owner TO postgres;', options)).toThrow(/lifecycle/);
  });

  it('rejects DATA-012 added memberships hidden in combined role lists', () => {
    const options = { role: 'game_security_owner', member: 'postgres', grantCount: 1, revokeCount: 1 };
    const withAddedMembership = 'GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres; GRANT game_security_owner, economy_security_owner TO postgres; REVOKE game_security_owner, economy_security_owner FROM postgres;';
    expect(() => expectRoleMembershipLifecycle(withAddedMembership, options)).toThrow(/lifecycle/);
  });

  it('rejects DATA-012 target-role membership for an undeclared member', () => {
    const options = { role: 'game_security_owner', member: 'postgres', grantCount: 1, revokeCount: 1 };
    const withAddedMember = 'GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres; GRANT game_security_owner TO forged_operator; REVOKE game_security_owner FROM forged_operator;';
    expect(() => expectRoleMembershipLifecycle(withAddedMember, options)).toThrow(/lifecycle/);
  });

  it('ignores DATA-012 membership-like SQL inside dollar-quoted bodies', () => {
    const options = { role: 'game_security_owner', member: 'postgres', grantCount: 1, revokeCount: 1 };
    const withDollarBody = "GRANT game_security_owner TO postgres; DO $body$ BEGIN PERFORM 'x;y'; GRANT game_security_owner TO postgres; END $body$; REVOKE game_security_owner FROM postgres;";
    expect(() => expectRoleMembershipLifecycle(withDollarBody, options)).not.toThrow();
  });

  it.each(['E', 'e'])('rejects DATA-012 forged memberships inside %s-prefixed escape strings', (prefix) => {
    const options = { role: 'game_security_owner', member: 'postgres', grantCount: 1, revokeCount: 1 };
    const withEscapeString = `SELECT ${prefix}'foo\\'; GRANT game_security_owner TO postgres; REVOKE game_security_owner FROM postgres; harmless';`;
    expect(() => expectRoleMembershipLifecycle(withEscapeString, options)).toThrow(/lifecycle/);
  });

  it('blocks DATA-027 when the runtime receipt is absent', () => {
    expect(executeData027(createRuntimeRoot())).toMatchObject({
      status: 'BLOCKED',
      reason: 'LOCAL_DB_EVIDENCE_UNAVAILABLE',
    });
  });

  it('passes DATA-027 when the runtime receipt is valid for the current input bundle', () => {
    const targetRoot = createRuntimeRoot();
    writeData027Receipt(targetRoot, observation, 'a'.repeat(40));
    expect(executeData027(targetRoot).status).toBe('PASS');
  });

  it('blocks DATA-027 when the runtime receipt is forged', () => {
    const targetRoot = createRuntimeRoot();
    writeData027Receipt(targetRoot, observation, 'a'.repeat(40));
    const receiptPath = path.join(targetRoot, ...DATA_027_RECEIPT_RELATIVE_PATH.split('/'));
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    receipt.successfulSeats = 3;
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
    expect(executeData027(targetRoot)).toMatchObject({
      status: 'BLOCKED',
      reason: 'LOCAL_DB_EVIDENCE_UNAVAILABLE',
    });
  });

  it('fails DATA-027 when its source projection is forged before receipt dispatch', () => {
    const targetRoot = createRuntimeRoot();
    expect(executeRequirementOracle(targetRoot, { ...data027Row, text: 'forged source row' }, data027Claim).status).toBe('FAIL');
  });

  it('fails an unsupported runtime-receipt requirement', () => {
    const row = registry.requirements.find((candidate: { id: string }) => candidate.id === 'DATA-001');
    const claim = evidence.entries.find((candidate: { id: string }) => candidate.id === 'DATA-001');
    const runtimeClaim = { ...claim, oracle: { ...claim.oracle, kind: 'RUNTIME_RECEIPT' } };
    expect(executeRequirementOracle(root, row, runtimeClaim).status).toBe('FAIL');
  });

  it.each(Array.from({ length: 13 }, (_, index) => `DATA-${String(index + 1).padStart(3, '0')}`))(
    '%s has an exact repository predicate',
    (id) => expect(evaluateDatabaseRequirement(id, source)).toBe(true),
  );

  it.each([
    ['DATA-001', 'schemas = ["public", "graphql_public"]', 'schemas = ["public", "private"]'],
    ['DATA-007', 'with (security_invoker = true)', 'with (security_invoker = false)'],
    ['DATA-009', 'create role game_security_owner nologin noinherit', 'create role game_security_owner login inherit'],
    ['DATA-010', 'revoke execute on function private.publish_economy_bundle_v1(jsonb,jsonb) from deployment_role', 'select 1'],
    ['DATA-011', 'private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) from app_server', 'private.set_pet_lock_v1(uuid,uuid,text,uuid,boolean) from authenticated'],
    ['DATA-013', 'set search_path = pg_catalog', 'set search_path = public'],
  ])('%s rejects a security weakening mutation', (id, needle, replacement) =>
    expect(() => evaluateDatabaseRequirement(id, {
      ...source,
      sql: source.sql.replaceAll(needle, replacement),
      config: source.config.replaceAll(needle, replacement),
      roles: source.roles.replaceAll(needle, replacement),
    })).toThrow());

  it('dispatches DATA-001 through DB_PROJECTION', () => {
    const row = registry.requirements.find((candidate: { id: string }) => candidate.id === 'DATA-001');
    const claim = evidence.entries.find((candidate: { id: string }) => candidate.id === 'DATA-001');
    expect(executeRequirementOracle(root, row, claim).status).toBe('PASS');
  });

  it.each(Array.from({ length: 8 }, (_, index) => `DATA-${String(index + 14).padStart(3, '0')}`))(
    '%s maps an exact match persistence predicate',
    (id) => expect(evaluateDatabaseRequirement(id, source)).toBe(true),
  );

  it.each(Array.from({ length: 4 }, (_, index) => `DATA-${String(index + 23).padStart(3, '0')}`))(
    '%s maps exact ACL evidence',
    (id) => expect(evaluateDatabaseRequirement(id, source)).toBe(true),
  );

  it.each(['DATA-028', 'DATA-029'])(
    '%s maps current domain or economy persistence evidence',
    (id) => expect(evaluateDatabaseRequirement(id, source)).toBe(true),
  );

  it.each([
    ['DATA-014', "'SUDDEN_DEATH'", "'SUDDEN_DRIFT'"],
    ['DATA-017', 'check (seat_no in (1,2))', 'check (seat_no in (1,2,3))'],
    ['DATA-018', 'deferrable initially deferred', 'not deferrable'],
    ['DATA-020', 'primary key(match_id, objective_id)', 'primary key(match_id, participant_key)'],
    ['DATA-021', "old.status = 'COMPLETED'", "old.status = 'PENDING'"],
  ])('%s rejects invariant mutation', (id, before, after) =>
    expect(() => evaluateDatabaseRequirement(id, { ...source, sql: source.sql.replace(before, after) })).toThrow());
});
