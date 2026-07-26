import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';

type Json = Record<string, any>;
export type SpotDifferenceQualityCheckOptions = {
  root?: string;
  quality?: Json;
  manifest?: Json;
  enforceRelease?: boolean;
};

const defaultRoot = resolve(import.meta.dirname, '../..');
const forbiddenGeneric = new Set(['change color', 'change shape', 'remove object', 'add object', '?됱긽 蹂寃?', '紐⑥뼇 蹂寃?', '?ㅻ툕?앺듃 ?쒓굅', '?ㅻ툕?앺듃 異붽?']);
const unfinishedMarkers = [['T', 'B', 'D'].join(''), ['T', 'O', 'D', 'O'].join(''), 'placeholder'];
const normalise = (value: string) => value.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
    : JSON.stringify(value);
const zoneFor = ({ cx, cy }: { cx: number; cy: number }) => 'ABCDEFGHI'[Math.min(2, Math.floor(cy * 3)) * 3 + Math.min(2, Math.floor(cx * 3))]!;
const countBy = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((candidate) => candidate === value).length]));
const equalJson = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

function computedDiagnostics(objectives: Json[]) {
  const zones = [...new Set(objectives.map(({ zone }) => zone))].sort();
  const changeTypes = [...new Set(objectives.map(({ changeType }) => changeType))].sort();
  return { zones, zoneCounts: countBy(objectives.map(({ zone }) => zone)), changeTypes, changeTypeCounts: countBy(objectives.map(({ changeType }) => changeType)) };
}

async function json(root: string, path: string) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Json;
}

export async function checkSpotDifferenceQuality(options: SpotDifferenceQualityCheckOptions = {}): Promise<string[]> {
  const root = options.root ?? defaultRoot;
  const [schema, catalog, quality, manifest] = await Promise.all([
    json(root, 'content/learning/spot-difference-quality.schema.json'),
    json(root, 'content/learning/catalog.v1.json'),
    options.quality ?? json(root, 'content/learning/spot-difference-quality.v1.json'),
    options.manifest ?? json(root, 'content/learning/manifest.v1.json'),
  ]);
  const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => { compile: (schema: unknown) => { (value: unknown): boolean; errors?: Array<{ instancePath?: string; message?: string }> } };
  const ajv = new AjvConstructor({ allErrors: true, strict: true });
  (addFormatsImport as unknown as (instance: typeof ajv) => unknown)(ajv);
  const validate = ajv.compile(schema);
  const failures: string[] = [];
  if (!validate(quality)) failures.push(`schema:${validate.errors?.map(({ instancePath, message }) => `${instancePath} ${message}`).join('|')}`);
  const catalogEntries = catalog.entries as Json[];
  const packs = quality.entries as Json[];
  const catalogKeys = catalogEntries.map(({ key }) => key);
  if (!equalJson(packs.map(({ contentKey }) => contentKey), catalogKeys)) failures.push('catalog-quality-bijection');

  for (const catalogEntry of catalogEntries) {
    const key = catalogEntry.key as string;
    const pack = packs.find(({ contentKey }) => contentKey === key);
    const manifestEntry = (manifest.entries as Json[]).find(({ key: entryKey }) => entryKey === key);
    if (!pack || !manifestEntry) continue;
    const objectives = pack.objectives as Json[];
    if (pack.catalogChangesSha256 !== sha256(canonicalJson(catalogEntry.changes))) failures.push(`${key}:catalog-changes`);
    if (objectives.length !== 10) failures.push(`${key}:objective-count`);
    if (objectives.filter(({ tier }) => tier === 'NORMAL').length !== 7 || objectives.filter(({ tier }) => tier === 'HARD').length !== 3) failures.push(`${key}:tier-cardinality`);
    if (objectives.filter(({ salience }) => salience === 'CLEAR').length !== 4 || objectives.filter(({ salience }) => salience === 'MODERATE').length !== 3 || objectives.filter(({ salience }) => salience === 'FOCUSED').length !== 3) failures.push(`${key}:salience-cardinality`);
    if (new Set(objectives.map(({ objectiveId }) => objectiveId)).size !== objectives.length) failures.push(`${key}:duplicate-objective-id`);
    for (const objective of objectives) {
      const fields = ['target', 'location', 'before', 'after'].map((field) => normalise(String(objective[field] ?? '')));
      if (fields.some((field) => !field || forbiddenGeneric.has(field) || unfinishedMarkers.some((marker) => field.includes(marker.toLocaleLowerCase('en-US'))) || field.includes('change color color'))) failures.push(`${key}:prompt-specificity:${objective.objectiveId}`);
      if (fields[2] === fields[3]) failures.push(`${key}:identical-before-after:${objective.objectiveId}`);
    }
    const diagnostics = computedDiagnostics(objectives);
    if (!equalJson(pack.releaseReadiness.diagnostics, diagnostics)) failures.push(`${key}:diagnostics-drift`);
    const bundle = await json(root, `content/learning/drafts/${key}.json`);
    const differences = bundle.privateSolution.differences as Json[];
    if (!equalJson(differences.map(({ objectiveId, tier, hitboxes }) => ({ objectiveId, tier, zone: zoneFor(hitboxes.imageA) })), objectives.map(({ objectiveId, tier, zone }) => ({ objectiveId, tier, zone })))) failures.push(`${key}:authoritative-objectives`);
    const [imageA, imageB] = await Promise.all(manifestEntry.images.map((path: string) => readFile(resolve(root, 'content/learning', path))));
    const assetHashes = [sha256(imageA), sha256(imageB)];
    if (!equalJson(assetHashes, manifestEntry.imageHashes) || !equalJson(assetHashes, [bundle.publicContent.imageA.sha256, bundle.publicContent.imageB.sha256])) failures.push(`${key}:referenced-assets`);
    if (manifestEntry.qualitySha256 !== sha256(canonicalJson(pack))) failures.push(`${key}:quality-hash`);
    if (options.enforceRelease) {
      const maxZoneCount = Math.max(...Object.values(diagnostics.zoneCounts).map(Number));
      const maxTypeCount = Math.max(...Object.values(diagnostics.changeTypeCounts).map(Number));
      if (pack.releaseReadiness.status !== 'PASS') failures.push(`${key}:release-readiness`);
      if (diagnostics.zones.length < 7 || maxZoneCount > 2) failures.push(`${key}:spatial-distribution`);
      if (diagnostics.changeTypes.length < 4 || maxTypeCount > 4) failures.push(`${key}:change-type-diversity`);
      if (objectives.some(({ mobileReview }) => mobileReview.status !== 'PASS')) failures.push(`${key}:mobile-review`);
      const review = pack.imagePairReview;
      if (review.status !== 'PASS' || !review.sameComposition || !review.sameCamera || !review.sameLightingDirection || !review.sameArtStyle || review.unintendedChangeStatus !== 'PASS') failures.push(`${key}:image-pair-review`);
    }
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = await checkSpotDifferenceQuality({ enforceRelease: process.argv.includes('--release') });
  if (failures.length) throw new Error(failures.join('\n'));
}
