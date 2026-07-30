import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  admitLearningBundleHintLadder,
  type LearningCatalogEntry,
} from '../../packages/content-validator/src/validate-learning-draft.js';

type Catalog = Readonly<{
  entries: readonly (LearningCatalogEntry & { category: string })[];
}>;

type LearningBundle = Readonly<{
  publicContent: Readonly<{
    contentId: string;
    contentRevisionId: string;
    imageA: Readonly<{ sha256: string }>;
    imageB: Readonly<{ sha256: string }>;
  }>;
}>;

export type LearningManifestEntry = Readonly<{
  key: string;
  category: string;
  contentId: string;
  contentRevisionId: string;
  bundle: string;
  evidence: string;
  images: readonly [string, string];
  imageHashes: readonly [string, string];
  promptEvidence: readonly Readonly<{ file: string; sha256: string }>[];
  hintLadderAdmission: ReturnType<typeof admitLearningBundleHintLadder>;
  rankedEligible: boolean;
  publishBlocked: true;
}>;

export type LearningManifest = Readonly<{
  schemaVersion: '1.0.0';
  status: 'DRAFT';
  entries: readonly LearningManifestEntry[];
}>;

const sha256 = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

export async function buildLearningManifest(
  learningRoot: string,
): Promise<LearningManifest> {
  const catalog = JSON.parse(
    await readFile(resolve(learningRoot, 'catalog.v1.json'), 'utf8'),
  ) as Catalog;
  const draftFiles = (await readdir(resolve(learningRoot, 'drafts')))
    .filter((file) => file.endsWith('.json'))
    .sort();
  if (draftFiles.length < catalog.entries.length) {
    throw new Error(
      `MISSING_DRAFT_FILES:${draftFiles.length}/${catalog.entries.length}`,
    );
  }

  const entries: LearningManifestEntry[] = [];
  for (const catalogEntry of catalog.entries) {
    const file = `${catalogEntry.key}.json`;
    if (!draftFiles.includes(file)) throw new Error(`MISSING_DRAFT:${catalogEntry.key}`);
    const bundle = JSON.parse(
      await readFile(resolve(learningRoot, 'drafts', file), 'utf8'),
    ) as LearningBundle;
    const evidenceFile = `${catalogEntry.key}.visual-delta.json`;
    const evidence = JSON.parse(
      await readFile(resolve(learningRoot, 'evidence', evidenceFile), 'utf8'),
    ) as { outsidePolicy?: string };
    if (evidence.outsidePolicy !== 'PASS') {
      throw new Error(`UNVERIFIED_DELTA:${catalogEntry.key}`);
    }
    const promptFiles = (await readdir(resolve(learningRoot, 'prompts')))
      .filter(
        (name) =>
          name.startsWith(`${catalogEntry.key}-`) && name.endsWith('.txt'),
      )
      .sort();
    const hintLadderAdmission = admitLearningBundleHintLadder(
      catalogEntry,
      bundle,
    );
    entries.push({
      key: catalogEntry.key,
      category: catalogEntry.category,
      contentId: bundle.publicContent.contentId,
      contentRevisionId: bundle.publicContent.contentRevisionId,
      bundle: `drafts/${file}`,
      evidence: `evidence/${evidenceFile}`,
      images: [
        `source/${catalogEntry.key}-a.png`,
        `source/${catalogEntry.key}-b.png`,
      ],
      imageHashes: [
        bundle.publicContent.imageA.sha256,
        bundle.publicContent.imageB.sha256,
      ],
      promptEvidence: await Promise.all(
        promptFiles.map(async (name) => ({
          file: `prompts/${name}`,
          sha256: sha256(await readFile(resolve(learningRoot, 'prompts', name))),
        })),
      ),
      hintLadderAdmission,
      rankedEligible:
        hintLadderAdmission.status === 'ADMITTED' &&
        hintLadderAdmission.stepCount === 5 &&
        hintLadderAdmission.hash !== null,
      publishBlocked: true,
    });
  }

  return { schemaVersion: '1.0.0', status: 'DRAFT', entries };
}

export async function writeLearningManifest(
  learningRoot: string,
  output = resolve(learningRoot, 'manifest.v1.json'),
): Promise<LearningManifest> {
  const manifest = await buildLearningManifest(learningRoot);
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
