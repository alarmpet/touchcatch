import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLearningManifest,
  writeLearningManifest,
} from './learning-manifest.js';

export { buildLearningManifest, writeLearningManifest };

const root = resolve(import.meta.dirname, '../..');
const learningRoot = resolve(root, 'content/learning');

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = await writeLearningManifest(learningRoot);
  console.log(
    `[MANIFEST SUCCESS] Manifest updated with ${manifest.entries.length} verified learning packs.`,
  );
}
