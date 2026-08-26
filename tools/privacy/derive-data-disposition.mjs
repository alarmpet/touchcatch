import console from 'node:console';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Proposes what happens to each table when an account is deleted, for a human to approve.
 *
 * The deletion worker needs an answer per table -- delete the rows, redact the identifying
 * columns, or keep them -- and that answer is a legal decision, not a derivable fact. What *is*
 * derivable is the list of tables that must have one: the subject graph in
 * docs/legal/data-subject-inventory.v1.json, which is itself computed from the migrations by
 * foreign-key reachability.
 *
 * So this proposes a default per table and preserves every decision a human has already made,
 * except where the schema's own shape settles it (see structuralDispositions below). A table that
 * appears in the schema and not in the approved file is the failure mode worth catching: it is how
 * a new feature quietly starts retaining data past a deletion request.
 *
 * The proposal is not an approval. `approval.status` stays PROPOSED until a person changes it,
 * and the worker refuses to run against anything else.
 *
 *   node tools/privacy/derive-data-disposition.mjs           write the proposal
 *   node tools/privacy/derive-data-disposition.mjs --check    fail if the schema has tables the
 *                                                             file does not answer for
 */

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const inventoryPath = path.join(repoRoot, 'docs', 'legal', 'data-subject-inventory.v1.json');
const dispositionPath = path.join(repoRoot, 'docs', 'legal', 'data-disposition.v1.json');

/**
 * The default is DELETE, and the exceptions are narrow on purpose.
 *
 * A default of RETAIN would mean every table someone forgets to classify silently survives
 * deletion, which is the opposite of what the person asked for. DELETE fails the other way:
 * loudly, in a test, before it ships.
 */

/**
 * Dispositions that follow from the shape of the schema rather than from anyone's judgement.
 *
 * These always win, including over a previously recorded decision, because they are not opinions.
 * A match belongs to both of its players: the schema already says so by making
 * `public.match_players.user_id` SET NULL rather than CASCADE. Deleting the match because one
 * participant left would destroy the other participant's record, which nobody asked for and no
 * regulator requires. The subject's identity is severed; the joint record stays.
 *
 * Per-participant rows inside a match are a different thing and are not listed here -- they key
 * on `participant_key`, belong to one person, and are deleted.
 *
 * Worth being exact about what these tables are today: **no code in the product creates a match**.
 * `apps/server` has no realtime transport at all -- no socket, no Redis, no queue -- and nothing
 * outside pgTAP calls `join_match_participant_v1` or the G3 adapter. Head-to-head play is not
 * merely out of the first beta; it cannot happen. What does exist is competition by record: the
 * weekly category board and the ghost run. So these rows are currently unreachable, and the
 * disposition below is about what the shape of the schema commits us to if they ever appear.
 */
const structuralDispositions = new Map(
  [
    [
      ['private.account_deletion_requests', 'private.account_access_tombstones'],
      {
        disposition: 'RETAIN',
        rationale:
          'The deletion audit itself. Deleting it destroys the evidence the request was honoured and breaks receipt lookup exactly when the person wants to check it finished, or reopens access at the moment deletion completes. Carries no email, nickname or provider identifier.',
      },
    ],
    [
      [
        'public.matches',
        'public.match_players',
        'private.match_events',
        'private.g3_journal',
        'private.g3_snapshots',
        'private.g3_effect_outbox',
        'private.g3_timer_intents',
        'private.g3_match_leases',
        'private.g3_command_receipts',
      ],
      {
        disposition: 'REDACT',
        rationale:
          'Joint match record keyed on the match, not on one person. The subject link is severed by public.match_players.user_id going NULL when the profile goes, which the schema already declares. Deleting the row would delete the other participant\'s record too. Unreachable today: nothing in the product creates a match, because apps/server has no realtime transport and nothing outside pgTAP calls join_match_participant_v1 or the G3 adapter. Competition in the shipped app is by record -- the weekly category board and the ghost run. If head-to-head ever ships, a human re-reads this line.',
      },
    ],
  ].flatMap(([tables, decision]) => tables.map((table) => [table, decision])),
);

function proposeFor(table) {
  return {
    disposition: 'DELETE',
    rationale:
      table.hopsFromSubject === 0
        ? 'Subject root. Nothing downstream survives it.'
        : `Reached from the subject through ${table.linkedVia}. Holds no record the service needs after the account is gone.`,
    proposedBy: 'tools/privacy/derive-data-disposition.mjs',
  };
}

const inventory = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));

/** Every table that must carry an answer: the subject graph plus the two audit tables. */
const required = [
  ...inventory.subjectTables.map((table) => ({
    table: table.table,
    linkedVia: table.linkedVia,
    hopsFromSubject: table.hopsFromSubject,
    definedIn: table.definedIn,
    freeFormColumns: table.freeFormColumns ?? [],
  })),
  ...inventory.intentionallyUnlinked.map((table) => ({
    table: table.table,
    linkedVia: 'NONE',
    hopsFromSubject: null,
    definedIn: table.definedIn,
    freeFormColumns: [],
  })),
].sort((a, b) => a.table.localeCompare(b.table));

let existing = null;
try {
  existing = JSON.parse(await fs.readFile(dispositionPath, 'utf8'));
} catch {
  existing = null;
}
const decided = new Map((existing?.tables ?? []).map((row) => [row.table, row]));

const tables = required.map((table) => {
  const previous = decided.get(table.table);
  const structural = structuralDispositions.get(table.table);
  const proposal = proposeFor(table);
  return {
    table: table.table,
    definedIn: table.definedIn,
    linkedVia: table.linkedVia,
    hopsFromSubject: table.hopsFromSubject,
    // Free-form columns are called out because a jsonb blob can carry identifying data that
    // a column-level REDACT would miss.
    freeFormColumns: table.freeFormColumns,
    disposition: structural?.disposition ?? previous?.disposition ?? proposal.disposition,
    rationale: structural?.rationale ?? previous?.rationale ?? proposal.rationale,
    decidedBy: structural
      ? 'schema shape (tools/privacy/derive-data-disposition.mjs)'
      : (previous?.decidedBy ?? proposal.proposedBy),
  };
});

const report = {
  schemaVersion: 1,
  generatedBy: 'tools/privacy/derive-data-disposition.mjs',
  note: 'Table list is derived from docs/legal/data-subject-inventory.v1.json. The disposition per table is a human decision and regenerating never overwrites one that is already recorded, except for rows whose decidedBy says "schema shape" -- those follow from the foreign keys rather than from judgement and are reasserted every run. The deletion worker refuses to run unless approval.status is APPROVED.',
  approval: existing?.approval ?? {
    status: 'PROPOSED',
    approvedBy: null,
    approvedAt: null,
    scope: null,
    note: 'No human has reviewed these dispositions. Until this says APPROVED, a deletion request blocks access and disposes of nothing.',
  },
  dispositions: {
    DELETE: 'Rows keyed on the subject are removed.',
    REDACT: 'Rows stay; identifying columns are overwritten. Use when an aggregate must survive.',
    RETAIN: 'Rows stay as they are. Requires a rationale that survives a regulator reading it.',
  },
  tableCount: tables.length,
  tables,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (existing === null) {
    console.error('docs/legal/data-disposition.v1.json is missing. run: pnpm privacy:disposition');
    process.exit(1);
  }
  const answered = new Set(existing.tables.map((row) => row.table));
  const missing = required.map((t) => t.table).filter((table) => !answered.has(table));
  const orphan = [...answered].filter(
    (table) => !required.some((candidate) => candidate.table === table),
  );
  if (missing.length > 0 || orphan.length > 0) {
    console.error('data disposition does not cover the current schema:');
    for (const table of missing) console.error(`  unanswered: ${table}`);
    for (const table of orphan) console.error(`  no longer in the subject graph: ${table}`);
    console.error('run: pnpm privacy:disposition');
    process.exit(1);
  }
  console.log(
    `data disposition covers ${existing.tables.length} tables (approval: ${existing.approval.status})`,
  );
} else {
  await fs.writeFile(dispositionPath, serialized, 'utf8');
  console.log(`data disposition written for ${tables.length} tables`);
}
