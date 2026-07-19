import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const learning = resolve(root, 'content/learning');
const catalog = JSON.parse(await readFile(resolve(learning, 'catalog.v1.json'), 'utf8')) as { entries: Array<{ key: string; category: string }> };
const draftFiles = (await readdir(resolve(learning, 'drafts'))).filter((file) => file.endsWith('.json')).sort();
if (draftFiles.length !== 9) throw new Error(`EXPECTED_NINE_DRAFTS:${draftFiles.length}`);
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const entries = [];
for (const catalogEntry of catalog.entries) {
  const file = `${catalogEntry.key}.json`;
  if (!draftFiles.includes(file)) throw new Error(`MISSING_DRAFT:${catalogEntry.key}`);
  const bundle = JSON.parse(await readFile(resolve(learning, 'drafts', file), 'utf8'));
  const evidenceFile = `${catalogEntry.key}.visual-delta.json`;
  const evidence = JSON.parse(await readFile(resolve(learning, 'evidence', evidenceFile), 'utf8'));
  if (evidence.outsidePolicy !== 'PASS') throw new Error(`UNVERIFIED_DELTA:${catalogEntry.key}`);
  const promptFiles = (await readdir(resolve(learning, 'prompts'))).filter((name) => name.startsWith(`${catalogEntry.key}-`) && name.endsWith('.txt')).sort();
  entries.push({
    key: catalogEntry.key,
    category: catalogEntry.category,
    contentId: bundle.publicContent.contentId,
    contentRevisionId: bundle.publicContent.contentRevisionId,
    bundle: `drafts/${file}`,
    evidence: `evidence/${evidenceFile}`,
    images: [`source/${catalogEntry.key}-a.png`, `source/${catalogEntry.key}-b.png`],
    imageHashes: [bundle.publicContent.imageA.sha256, bundle.publicContent.imageB.sha256],
    promptEvidence: await Promise.all(promptFiles.map(async (name) => ({ file: `prompts/${name}`, sha256: sha(await readFile(resolve(learning, 'prompts', name))) }))),
    publishBlocked: true,
  });
}
await writeFile(resolve(learning, 'manifest.v1.json'), `${JSON.stringify({ schemaVersion: '1.0.0', status: 'DRAFT', entries }, null, 2)}\n`, 'utf8');
