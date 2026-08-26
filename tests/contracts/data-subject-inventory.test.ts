import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Inventory = {
  subjectRoots: string[];
  subjectTables: { table: string; linkedVia: string; hopsFromSubject: number; freeFormColumns: string[] }[];
  unlinkedSubjectCandidates: { table: string; subjectIdentifierColumns: string[]; opaqueRowColumns: string[] }[];
  intentionallyUnlinked: { table: string; rationale: string }[];
  tablesOutsideSubjectGraph: string[];
};

async function inventory(): Promise<Inventory> {
  return JSON.parse(await readFile(resolve('docs/legal/data-subject-inventory.v1.json'), 'utf8')) as Inventory;
}

describe('data subject inventory', () => {
  // The account-deletion worker can only dispose of what someone listed. Keeping that list in a
  // person's head is how a table quietly survives a deletion, so it is derived and gated instead.
  it('reaches the app data a person accumulates', async () => {
    const { subjectTables, subjectRoots } = await inventory();
    const names = subjectTables.map((row) => row.table);

    expect(subjectRoots).toEqual(['auth.users', 'private.economy_subjects', 'public.profiles']);
    for (const table of [
      'private.economy_subjects',
      'private.learning_attempts',
      'private.learning_attempt_taps',
      'private.learning_progression_ledgers',
      'private.pet_inventory',
      'private.reward_ledger',
      'private.daily_pet_claims',
      'private.idempotency_requests',
      'public.profiles',
    ]) {
      expect(names).toContain(table);
    }
  });

  // Catalog and policy tables describe the game, not the player. If one of these ever shows up as
  // subject data the reachability walk has gone wrong and the deletion scope is too wide.
  it('leaves catalog and policy tables out of the subject graph', async () => {
    const { subjectTables, tablesOutsideSubjectGraph } = await inventory();
    const names = subjectTables.map((row) => row.table);

    for (const table of ['private.pet_definitions', 'public.pet_catalog', 'private.weekly_seasons']) {
      expect(tablesOutsideSubjectGraph).toContain(table);
      expect(names).not.toContain(table);
    }
  });

  // The g3_* match tables were the finding that produced this file: six tables carrying
  // `match_id uuid not null` with no foreign key, invisible to a cascade delete and to the
  // reachability walk alike. 202608260001 attached them to public.matches, and this pins the
  // attachment - dropping a constraint would silently take them back out of the deletion scope.
  it('keeps the g3 match tables inside the subject graph', async () => {
    const { subjectTables, unlinkedSubjectCandidates } = await inventory();
    const linked = new Map(subjectTables.map((row) => [row.table, row]));

    for (const table of [
      'private.g3_journal',
      'private.g3_snapshots',
      'private.g3_command_receipts',
      'private.g3_effect_outbox',
      'private.g3_timer_intents',
      'private.g3_match_leases',
    ]) {
      expect(linked.get(table)?.linkedVia).toBe('public.matches');
      expect(unlinkedSubjectCandidates.map((row) => row.table)).not.toContain(table);
    }
  });

  // What is left needs a human decision rather than a constraint. The legacy quarantine tables
  // hold entire user rows inside one jsonb column, so no column-name scan and no foreign key can
  // reach them; the admin tables belong to a different data subject than the player.
  it('still flags what a foreign key cannot express', async () => {
    const { unlinkedSubjectCandidates } = await inventory();
    const flagged = new Map(unlinkedSubjectCandidates.map((row) => [row.table, row]));

    expect([...flagged.keys()].sort()).toEqual([
      'private.admin_publish_receipts',
      'private.admin_sessions',
      'private.legacy_game_contents_quarantine',
      'private.legacy_match_events_quarantine',
      'private.legacy_matches_quarantine',
    ]);
    expect(flagged.get('private.legacy_matches_quarantine')?.opaqueRowColumns).toEqual(['match_row', 'player_rows']);
    expect(flagged.get('private.admin_sessions')?.subjectIdentifierColumns).toContain('actor_id');
  });

  // Deletion bookkeeping names a person on purpose and must survive the deletion it records.
  // Kept apart from the review list because a list that always has entries stops being read,
  // and each exemption has to carry a reason a later reader can judge.
  it('separates deliberate exemptions from tables that were simply missed', async () => {
    const { intentionallyUnlinked, unlinkedSubjectCandidates } = await inventory();
    const exempt = new Map(intentionallyUnlinked.map((row) => [row.table, row.rationale]));

    expect([...exempt.keys()].sort()).toEqual([
      'private.account_access_tombstones',
      'private.account_deletion_requests',
    ]);
    for (const rationale of exempt.values()) expect(rationale.length).toBeGreaterThan(40);
    for (const table of exempt.keys()) {
      expect(unlinkedSubjectCandidates.map((row) => row.table)).not.toContain(table);
    }
  });

  // A column-name PII scan cannot see inside jsonb. Naming the columns is the minimum needed for
  // a human to decide whether each one carries personal data.
  it('names the free-form columns a column-name scan cannot see into', async () => {
    const { subjectTables } = await inventory();
    const withJson = subjectTables.filter((row) => row.freeFormColumns.length > 0);

    expect(withJson.length).toBeGreaterThan(0);
    expect(withJson.find((row) => row.table === 'private.idempotency_requests')?.freeFormColumns)
      .toContain('response_body');
  });
});
