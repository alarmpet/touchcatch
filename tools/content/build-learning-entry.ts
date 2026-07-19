import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { evaluateVisualDelta, type DeltaRegion, type VisualDeltaPolicy } from './visual-delta.js';
import { writeLearningBundle, type LearningGeometry } from './write-learning-bundle.js';

type GeometryFile = LearningGeometry & { policy: VisualDeltaPolicy };
type Catalog = { entries: Array<{ key: string; language: 'en' | 'ko'; canonicalAnswer: string; aliases: string[]; meaning: { prompt: string; options: Array<{ id: string; label: string }>; correctOptionId: string } }> };

const key = process.argv[2];
if (!key) throw new Error('USAGE: build-learning-entry <key>');
const projectRoot = resolve(import.meta.dirname, '../..');
const learningRoot = resolve(projectRoot, 'content/learning');
const catalog = JSON.parse(await readFile(resolve(learningRoot, 'catalog.v1.json'), 'utf8')) as Catalog;
const entry = catalog.entries.find((candidate) => candidate.key === key);
if (!entry) throw new Error(`UNKNOWN_LEARNING_KEY:${key}`);
const geometry = JSON.parse(await readFile(resolve(learningRoot, 'geometry', `${key}.json`), 'utf8')) as GeometryFile;
const imageA = resolve(learningRoot, 'source', `${key}-a.png`);
const imageB = resolve(learningRoot, 'source', `${key}-b.png`);
const evidencePath = resolve(learningRoot, 'evidence', `${key}.visual-delta.json`);
const bundlePath = resolve(learningRoot, 'drafts', `${key}.json`);
await Promise.all([mkdir(dirname(evidencePath), { recursive: true }), mkdir(dirname(bundlePath), { recursive: true })]);
const regions: DeltaRegion[] = (geometry.differences ?? []).map(({ id, cx, cy, r }) => ({ id, cx, cy, r }));
const report = await evaluateVisualDelta(imageA, imageB, regions, geometry.policy);
await writeFile(evidencePath, `${JSON.stringify({ ...report, policy: geometry.policy, regions }, null, 2)}\n`, 'utf8');
await writeLearningBundle(entry, imageA, imageB, bundlePath, geometry);
console.log(`${key}: ${report.changedRegions} regions, outside ratio ${report.outsideChangedRatio}`);
