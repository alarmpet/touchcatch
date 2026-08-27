import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import frozenRuleset from '../config/ruleset.v1.json' with { type: 'json' };
import { parseRuleset } from '../packages/contracts/src/rules.schema.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const migrationPath = resolve(root, 'supabase/migrations/202607150002_content_security.sql');
const begin = '  -- BEGIN GENERATED RULESET CONTENT PREDICATES';
const end = '  -- END GENERATED RULESET CONTENT PREDICATES';

/**
 * A board carries as many differences as its artwork holds, so the predicate checks a range
 * and a proportion rather than two fixed counts.
 *
 * The HARD count is `round(n × numerator / denominator)` expressed as integer division —
 * `(2·num·n + den) / (2·den)` — because this has to produce the identical integer as
 * `hardDifferenceCount` in TypeScript for every admissible board. Writing it as
 * `round(n * 0.3)` would not: `0.3` is 0.2999… in IEEE754, so a five-difference board
 * rounds to 1 in JavaScript and to 2 in Postgres `numeric`, and content that validated in
 * the tool would be rejected by the database.
 */
export function renderRulesetProjection(): string {
  const { content } = parseRuleset(frozenRuleset);
  const normalWords = content.wordHunts - 1;
  const total = "jsonb_array_length(requested_private_solution->'differences')";
  const hard = `((2 * ${content.hardDifferenceNumerator} * ${total} + ${content.hardDifferenceDenominator}) / ${2 * content.hardDifferenceDenominator})`;
  return [
    begin,
    `  if ${total} < ${content.minDifferences}`,
    `     or ${total} > ${content.maxDifferences}`,
    `     or jsonb_array_length(requested_private_solution->'wordHunts') <> ${content.wordHunts}`,
    `     or (select count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='HARD') <> ${hard}`,
    `     or (select count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='NORMAL') <> ${total} - ${hard}`,
    `     or (select count(*) from jsonb_array_elements(requested_private_solution->'wordHunts') item where item->>'kind'='NORMAL') <> ${normalWords}`,
    "     or (select count(*) from jsonb_array_elements(requested_private_solution->'wordHunts') item where item->>'kind'='SPECIAL') <> 1",
    `     or (select count(distinct item->>'objectiveId') from jsonb_array_elements(requested_private_solution->'differences') item) <> ${total}`,
    `     or (select count(distinct item->>'missionId') from jsonb_array_elements(requested_private_solution->'wordHunts') item) <> ${content.wordHunts}`,
    '  then',
    "    raise exception using errcode = '22023', message = 'PRIVATE_CONTENT_VALUE_INVALID';",
    '  end if;',
    end,
  ].join('\n');
}

function markerRange(migration: string): { start: number; finish: number } {
  const begins = [...migration.matchAll(new RegExp(begin, 'g'))];
  const ends = [...migration.matchAll(new RegExp(end, 'g'))];
  if (begins.length !== 1 || ends.length !== 1) throw new Error('RULESET_PROJECTION_MARKERS');
  const start = begins[0]!.index;
  const finish = ends[0]!.index + end.length;
  if (finish <= start) throw new Error('RULESET_PROJECTION_MARKERS');
  return { start, finish };
}

function assertNoCompetingPredicates(outside: string): void {
  const active = outside.replace(/--[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const patterns = [
    /jsonb_array_length\(requested_private_solution->'(?:differences|wordHunts)'\)\s*<>\s*\d+/g,
    /count\((?:\*|distinct[^)]*)\)[\s\S]{0,180}?requested_private_solution->'(?:differences|wordHunts)'[\s\S]{0,180}?<>\s*\d+/g,
  ];
  if (patterns.some((pattern) => pattern.test(active))) throw new Error('RULESET_PROJECTION_COMPETING_PREDICATE');
}

function publishingFunctionRange(migration: string): { start: number; finish: number } {
  const signature = 'create or replace function private.publish_content_revision_v1(';
  const start = migration.indexOf(signature);
  const finish = migration.indexOf('alter function private.publish_content_revision_v1', start);
  if (start < 0 || finish < 0 || migration.indexOf(signature, start + 1) >= 0) throw new Error('RULESET_PROJECTION_FUNCTION_BOUNDARY');
  return { start, finish };
}

export async function checkRulesetProjection(_unused?: string, migrationOverride?: string): Promise<void> {
  const migration = migrationOverride ?? await readFile(migrationPath, 'utf8');
  const { start, finish } = markerRange(migration);
  const ownedFunction = publishingFunctionRange(migration);
  if (start < ownedFunction.start || finish > ownedFunction.finish) throw new Error('RULESET_PROJECTION_FUNCTION_BOUNDARY');
  if (migration.slice(start, finish) !== renderRulesetProjection()) throw new Error('RULESET_PROJECTION_BYTE_DRIFT');
  const before = migration.slice(0, start);
  const after = migration.slice(finish);
  if (!/ {2}end if;\r?\n$/.test(before) || !/^\r?\n {2}if not \(requested_private_solution->'suddenDeath'\)/.test(after)) {
    throw new Error('RULESET_PROJECTION_ADJACENCY');
  }
  assertNoCompetingPredicates(migration.slice(ownedFunction.start, start) + migration.slice(finish, ownedFunction.finish));
}

async function writeProjection(): Promise<void> {
  const migration = await readFile(migrationPath, 'utf8');
  const { start, finish } = markerRange(migration);
  await writeFile(migrationPath, migration.slice(0, start) + renderRulesetProjection() + migration.slice(finish), 'utf8');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) await checkRulesetProjection(); else await writeProjection();
}
