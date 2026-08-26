import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * Ties the disposal function to the disposition decision.
 *
 * The disposition file is derived from the schema, so a new user-linked table appears in it the
 * moment its migration lands. The SQL that disposes of data is written by hand. Without this
 * test the two drift in the one direction nobody notices: a feature adds a table, the table is
 * marked DELETE, and the function that deletes never learns about it. The account is closed, the
 * data stays, and every check in the repository is green.
 *
 * The comparison is exact in both directions. A table deleted by the function but not marked
 * DELETE is the opposite failure and just as bad -- it means data is being destroyed that
 * somebody decided to keep.
 */

const migrationPath = 'supabase/migrations/202608260003_account_deletion_worker.sql';
const dispositionPath = 'docs/legal/data-disposition.v1.json';

type Disposition = {
  approval: { status: string };
  tables: Array<{ table: string; disposition: 'DELETE' | 'REDACT' | 'RETAIN' }>;
};

/**
 * Only the statements inside `dispose_account_app_data_v1` count. The subqueries that read from a
 * table to find the rows to delete are not deletions, so this matches `delete from` alone.
 */
async function deletedTables(): Promise<Set<string>> {
  const sql = await readFile(migrationPath, 'utf8');
  const start = sql.indexOf('create function private.dispose_account_app_data_v1');
  expect(start, 'dispose_account_app_data_v1 not found in the migration').toBeGreaterThan(-1);
  const end = sql.indexOf('\ncreate function', start + 1);
  const body = sql.slice(start, end === -1 ? undefined : end);
  return new Set(
    [...body.matchAll(/\bdelete\s+from\s+((?:private|public)\.[a-z_]+)/gu)].map((m) => m[1]!),
  );
}

async function disposition(): Promise<Disposition> {
  return JSON.parse(await readFile(dispositionPath, 'utf8')) as Disposition;
}

describe('account deletion disposal coverage', () => {
  it('deletes exactly the tables the disposition marks DELETE', async () => {
    const { tables } = await disposition();
    const shouldDelete = new Set(
      tables.filter((row) => row.disposition === 'DELETE').map((row) => row.table),
    );
    const doesDelete = await deletedTables();

    const missed = [...shouldDelete].filter((table) => !doesDelete.has(table)).toSorted();
    const extra = [...doesDelete].filter((table) => !shouldDelete.has(table)).toSorted();

    expect(missed, 'marked DELETE but the disposal function never touches them').toEqual([]);
    expect(extra, 'deleted by the disposal function but not marked DELETE').toEqual([]);
  });

  it('never deletes a table marked RETAIN or REDACT', async () => {
    const { tables } = await disposition();
    const doesDelete = await deletedTables();
    const violations = tables
      .filter((row) => row.disposition !== 'DELETE' && doesDelete.has(row.table))
      .map((row) => `${row.table} (${row.disposition})`);
    expect(violations).toEqual([]);
  });

  it('keeps the deletion audit out of the disposal', async () => {
    // Stated separately from the RETAIN check because these two are the reason a receipt still
    // resolves after the account is gone, and a future edit to the disposition file must not be
    // able to turn them into deletions.
    const doesDelete = await deletedTables();
    expect(doesDelete.has('private.account_deletion_requests')).toBe(false);
    expect(doesDelete.has('private.account_access_tombstones')).toBe(false);
  });

  it('leaves auth.users to the Auth Admin API', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    // Sessions, identities and refresh tokens live behind GoTrue. SQL that deleted the auth row
    // directly would leave that service holding state it believes is live.
    expect(sql).not.toMatch(/\bdelete\s+from\s+auth\./u);
  });

  it('does not grant the API role any worker function', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const grants = [...sql.matchAll(/grant execute on function ([^;]+?) to ([^;]+);/gsu)];
    expect(grants.length).toBeGreaterThan(0);
    for (const [, target, grantees] of grants) {
      expect(
        (grantees ?? '').includes('economy_server'),
        `${(target ?? '').trim().split('(')[0]} is granted to economy_server; accepting a deletion request and carrying one out must stay separate authorities`,
      ).toBe(false);
    }
  });

  it('records the approval state so a reader knows whether disposal may run at all', async () => {
    const { approval } = await disposition();
    // Not an assertion that it is approved -- it is not, and should not be until a human reads
    // the table. This pins that the field exists and carries one of the values the worker checks.
    expect(['PROPOSED', 'APPROVED', 'REJECTED']).toContain(approval.status);
  });
});
