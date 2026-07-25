import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateVisualDelta } from './visual-delta.js';
import { writeLearningBundle } from './write-learning-bundle.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const keys = process.argv.slice(2);
if (keys.length === 0) throw new Error('USAGE: node build-learning-entry.js <key1> [key2 ...]');

const projectRoot = resolve(currentDir, '../..');
const learningRoot = resolve(projectRoot, 'content/learning');
const catalog = JSON.parse(await readFile(resolve(learningRoot, 'catalog.v1.json'), 'utf8'));

for (const key of keys) {
  const entry = catalog.entries.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`UNKNOWN_LEARNING_KEY:${key}`);
  const geometry = JSON.parse(await readFile(resolve(learningRoot, 'geometry', `${key}.json`), 'utf8'));
  const imageA = resolve(learningRoot, 'source', `${key}-a.png`);
  const imageB = resolve(learningRoot, 'source', `${key}-b.png`);
  const evidencePath = resolve(learningRoot, 'evidence', `${key}.visual-delta.json`);
  const bundlePath = resolve(learningRoot, 'drafts', `${key}.json`);
  await Promise.all([mkdir(dirname(evidencePath), { recursive: true }), mkdir(dirname(bundlePath), { recursive: true })]);
  const regions = (geometry.differences ?? []).map(({ id, cx, cy, r }) => ({ id, cx, cy, r }));
  const report = await evaluateVisualDelta(imageA, imageB, regions, geometry.policy);
  await writeFile(evidencePath, `${JSON.stringify({ ...report, policy: geometry.policy, regions }, null, 2)}\n`, 'utf8');
  await writeLearningBundle(entry, imageA, imageB, bundlePath, geometry);
  console.log(`[BUILD SUCCESS] ${key}: ${report.changedRegions} regions, outside ratio ${report.outsideChangedRatio.toFixed(4)}`);
}
