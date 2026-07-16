import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import frozenRuleset from '../config/ruleset.v1.json' with { type: 'json' };
import { parseRuleset } from '../packages/contracts/src/rules.schema.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const migrationPath = resolve(root, 'supabase/migrations/202607150002_content_security.sql');
const begin = '  -- BEGIN GENERATED RULESET CONTENT PREDICATES';
const end = '  -- END GENERATED RULESET CONTENT PREDICATES';

export function renderRulesetProjection(): string {
  const { content } = parseRuleset(frozenRuleset);
  const differences = content.normalDifferences + content.hardDifferences;
  const normalWords = content.wordHunts - 1;
  return [
    begin,
    `  if jsonb_array_length(requested_private_solution->'differences') <> ${differences}`,
    `     or jsonb_array_length(requested_private_solution->'wordHunts') <> ${content.wordHunts}`,
    `     or (select count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='NORMAL') <> ${content.normalDifferences}`,
    `     or (select count(*) from jsonb_array_elements(requested_private_solution->'differences') item where item->>'tier'='HARD') <> ${content.hardDifferences}`,
    `     or (select count(*) from jsonb_array_elements(requested_private_solution->'wordHunts') item where item->>'kind'='NORMAL') <> ${normalWords}`,
    "     or (select count(*) from jsonb_array_elements(requested_private_solution->'wordHunts') item where item->>'kind'='SPECIAL') <> 1",
    `     or (select count(distinct item->>'objectiveId') from jsonb_array_elements(requested_private_solution->'differences') item) <> ${differences}`,
    `     or (select count(distinct item->>'missionId') from jsonb_array_elements(requested_private_solution->'wordHunts') item) <> ${content.wordHunts}`,
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

export async function checkRulesetProjection(_unused?: string, migrationOverride?: string): Promise<void> {
  const migration = migrationOverride ?? await readFile(migrationPath, 'utf8');
  const { start, finish } = markerRange(migration);
  if (migration.slice(start, finish) !== renderRulesetProjection()) throw new Error('RULESET_PROJECTION_BYTE_DRIFT');
  assertNoCompetingPredicates(migration.slice(0, start) + migration.slice(finish));
}

async function writeProjection(): Promise<void> {
  const migration = await readFile(migrationPath, 'utf8');
  const { start, finish } = markerRange(migration);
  await writeFile(migrationPath, migration.slice(0, start) + renderRulesetProjection() + migration.slice(finish), 'utf8');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) await checkRulesetProjection(); else await writeProjection();
}
