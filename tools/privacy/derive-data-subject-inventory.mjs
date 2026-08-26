// Derives which tables hold data belonging to an identifiable user, by walking foreign keys
// outward from the three roots a person is known by.
//
// This exists because "delete the account" is only as complete as the list it deletes from, and
// that list was being kept in people's heads. Reading the migrations rather than a live database
// keeps the answer reproducible on a machine with no Docker, and lets the gate fail when a new
// table joins the graph without anyone revisiting the privacy inventory.
//
// Usage:
//   node tools/privacy/derive-data-subject-inventory.mjs           # rewrite the inventory
//   node tools/privacy/derive-data-subject-inventory.mjs --check   # fail on drift

import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = 'supabase/migrations';
const OUTPUT = 'docs/legal/data-subject-inventory.v1.json';

// A person enters the system as an auth user, is projected to a stable economy subject, and gets
// a public profile. Everything reachable from these by a foreign key is theirs by association.
const ROOTS = ['auth.users', 'private.economy_subjects', 'public.profiles'];

const QUALIFIED = '(?:private|public|auth)\\.[a-z0-9_]+';

// Column names that identify a person even when no foreign key says so.
const SUBJECT_IDENTIFIERS = new Set([
  'user_id', 'subject_key', 'match_id', 'player_id', 'profile_id',
  'account_id', 'authenticated_user_id', 'owner_id', 'actor_id',
]);

// jsonb columns that carry a copied user row rather than a structured value.
const OPAQUE_ROW_COLUMNS = new Set(['legacy_row', 'match_row', 'player_rows', 'state', 'event']);

// Tables that name a person on purpose and must NOT be reachable by cascade.
//
// Without this the deletion bookkeeping would sit in the review list forever, and a list that
// always has entries stops being read. Each exemption carries its reason so a later reader can
// judge whether it still holds rather than trusting that someone once did.
const INTENTIONALLY_UNLINKED = new Map([
  ['private.account_deletion_requests', 'Audit record of the deletion itself. A foreign key would cascade it away with the account it documents, leaving no evidence the request was ever honoured and no way to resolve the receipt afterwards.'],
  ['private.account_access_tombstones', 'Records that a subject_key is closed. Cascading from the subject it closes would reopen access at the moment deletion completed.'],
]);

function stripComments(sql) {
  return sql.replace(/--[^\n]*/gu, '');
}

/** Reads forward from `openIndex` (the `(` after the table name) to its matching `)`. */
function balancedBlock(sql, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    else if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  return sql.slice(openIndex + 1);
}

function parseMigration(sql) {
  const text = stripComments(sql);
  const tables = new Map(); // name -> { references:Set, jsonbColumns:Set }
  const dropped = new Set();

  const createPattern = new RegExp(`create table\\s+(?:if not exists\\s+)?(${QUALIFIED})\\s*\\(`, 'giu');
  for (let match = createPattern.exec(text); match !== null; match = createPattern.exec(text)) {
    const name = match[1].toLowerCase();
    const body = balancedBlock(text, match.index + match[0].length - 1);
    const references = new Set(
      [...body.matchAll(new RegExp(`references\\s+(${QUALIFIED})`, 'giu'))].map((m) => m[1].toLowerCase()),
    );
    // jsonb is where free-form user content hides from a column-name PII scan.
    const jsonbColumns = new Set(
      [...body.matchAll(/(^|,)\s*([a-z0-9_]+)\s+jsonb\b/giu)].map((m) => m[2].toLowerCase()),
    );
    const columns = new Set(
      [...body.matchAll(/(^|,)\s*([a-z0-9_]+)\s+(uuid|bigint|text|timestamptz|jsonb|boolean|integer|numeric)\b/giu)]
        .map((m) => m[2].toLowerCase()),
    );
    tables.set(name, { references, jsonbColumns, columns });
  }

  // Constraints added after the fact are just as binding as inline ones.
  const alterPattern = new RegExp(`alter table\\s+(?:only\\s+)?(${QUALIFIED})([\\s\\S]*?);`, 'giu');
  for (let match = alterPattern.exec(text); match !== null; match = alterPattern.exec(text)) {
    const name = match[1].toLowerCase();
    const targets = [...match[2].matchAll(new RegExp(`references\\s+(${QUALIFIED})`, 'giu'))]
      .map((m) => m[1].toLowerCase());
    if (targets.length === 0) continue;
    const entry = tables.get(name) ?? { references: new Set(), jsonbColumns: new Set() };
    for (const target of targets) entry.references.add(target);
    tables.set(name, entry);
  }

  const dropPattern = new RegExp(`drop table\\s+(?:if exists\\s+)?(${QUALIFIED})`, 'giu');
  for (let match = dropPattern.exec(text); match !== null; match = dropPattern.exec(text)) {
    dropped.add(match[1].toLowerCase());
  }

  return { tables, dropped };
}

function buildGraph(root) {
  const files = fs.readdirSync(path.join(root, MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  const graph = new Map();
  for (const file of files) {
    const { tables, dropped } = parseMigration(fs.readFileSync(path.join(root, MIGRATIONS, file), 'utf8'));
    for (const [name, entry] of tables) {
      const existing = graph.get(name);
      if (existing === undefined) {
        graph.set(name, {
          references: entry.references,
          jsonbColumns: entry.jsonbColumns,
          columns: entry.columns ?? new Set(),
          definedIn: file,
        });
        continue;
      }
      for (const reference of entry.references) existing.references.add(reference);
      for (const column of entry.jsonbColumns) existing.jsonbColumns.add(column);
      for (const column of entry.columns ?? []) existing.columns.add(column);
    }
    for (const name of dropped) graph.delete(name);
  }
  return graph;
}

/**
 * A table belongs to the subject graph when it points at a root or at something already in it.
 * Catalog tables (pet definitions, content revisions) point the other way and stay out.
 */
function reachable(graph) {
  const included = new Map();
  for (const name of ROOTS) if (graph.has(name)) included.set(name, { via: 'ROOT', hops: 0 });

  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, entry] of graph) {
      if (included.has(name)) continue;
      for (const reference of entry.references) {
        const parent = included.get(reference) ?? (ROOTS.includes(reference) ? { hops: 0 } : undefined);
        if (parent === undefined) continue;
        included.set(name, { via: reference, hops: parent.hops + 1 });
        changed = true;
        break;
      }
    }
  }
  return included;
}

export function deriveInventory(root) {
  const graph = buildGraph(root);
  const included = reachable(graph);
  const rows = [...included.entries()]
    .filter(([name]) => !ROOTS.includes(name) || graph.has(name))
    .map(([name, meta]) => ({
      table: name,
      linkedVia: meta.via,
      hopsFromSubject: meta.hops,
      definedIn: graph.get(name)?.definedIn ?? null,
      freeFormColumns: [...(graph.get(name)?.jsonbColumns ?? [])].sort(),
    }))
    .sort((a, b) => (a.hopsFromSubject - b.hopsFromSubject) || a.table.localeCompare(b.table));

  const outside = [...graph.keys()].filter((name) => !included.has(name)).sort();

  // Reachability alone is not enough. Several tables key on a subject identifier without ever
  // declaring a foreign key (the g3_* match tables), and the legacy quarantine tables hold whole
  // user rows inside a single jsonb column. Nothing links them to a person, so a cascade delete
  // walks straight past them and the data survives an account deletion in silence.
  const unlinked = outside
    .map((name) => {
      const entry = graph.get(name);
      const identifiers = [...(entry?.columns ?? [])].filter((column) => SUBJECT_IDENTIFIERS.has(column)).sort();
      const opaque = [...(entry?.jsonbColumns ?? [])].filter((column) => OPAQUE_ROW_COLUMNS.has(column)).sort();
      if (identifiers.length === 0 && opaque.length === 0) return null;
      if (INTENTIONALLY_UNLINKED.has(name)) return null;
      return {
        table: name,
        definedIn: entry?.definedIn ?? null,
        subjectIdentifierColumns: identifiers,
        opaqueRowColumns: opaque,
        reason: opaque.length > 0
          ? 'holds whole user rows inside jsonb with no foreign key'
          : 'keys on a subject identifier with no foreign key',
      };
    })
    .filter((row) => row !== null);

  const intentional = [...INTENTIONALLY_UNLINKED.entries()]
    .filter(([name]) => graph.has(name))
    .map(([table, rationale]) => ({ table, definedIn: graph.get(table)?.definedIn ?? null, rationale }));

  return {
    schemaVersion: 1,
    generatedBy: 'tools/privacy/derive-data-subject-inventory.mjs',
    note: 'Derived from supabase/migrations by foreign-key reachability. Not a legal approval: retention, lawful basis and disposition per table are decided by a human and recorded separately.',
    subjectRoots: ROOTS,
    subjectTables: rows,
    unlinkedSubjectCandidates: unlinked,
    intentionallyUnlinked: intentional,
    tablesOutsideSubjectGraph: outside
      .filter((name) => !unlinked.some((row) => row.table === name))
      .filter((name) => !INTENTIONALLY_UNLINKED.has(name)),
  };
}

const root = process.cwd();
const derived = deriveInventory(root);
const serialized = `${JSON.stringify(derived, null, 2)}\n`;
const target = path.join(root, OUTPUT);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  if (current !== serialized) {
    console.error(`${OUTPUT} is stale. Run: node tools/privacy/derive-data-subject-inventory.mjs`);
    process.exit(1);
  }
  console.log(`data-subject inventory: ${derived.subjectTables.length} tables carry subject data, ${derived.tablesOutsideSubjectGraph.length} outside`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(`wrote ${OUTPUT}: ${derived.subjectTables.length} subject tables, ${derived.tablesOutsideSubjectGraph.length} outside`);
}
