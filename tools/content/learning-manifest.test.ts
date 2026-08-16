import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import {
  buildLearningManifest,
  writeLearningManifest,
} from './learning-manifest.js';
import { generateMobileRegistry } from './generate-registry.js';

const root = resolve(import.meta.dirname, '../..');
const execFileAsync = promisify(execFile);

async function committedFile(path: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['show', `HEAD:${path}`], {
    cwd: root,
    encoding: 'utf8',
  });
  return stdout;
}

async function withRepresentativeLearningRoot(
  action: (learningRoot: string) => Promise<void>,
): Promise<void> {
  const learningRoot = await mkdtemp(resolve(tmpdir(), 'learning-manifest-'));
  try {
    await Promise.all(
      ['drafts', 'evidence', 'prompts'].map((directory) =>
        mkdir(resolve(learningRoot, directory), { recursive: true }),
      ),
    );
    const productionCatalog = JSON.parse(
      await readFile(resolve(root, 'content/learning/catalog.v1.json'), 'utf8'),
    ) as { entries: Array<{ key: string }> };
    const keys = ['en-resilience', 'en-dilemma'];
    const entries = productionCatalog.entries.filter((entry) =>
      keys.includes(entry.key),
    );
    await writeFile(
      resolve(learningRoot, 'catalog.v1.json'),
      `${JSON.stringify({ schemaVersion: '1.0.0', entries }, null, 2)}\n`,
      'utf8',
    );
    for (const key of keys) {
      await writeFile(
        resolve(learningRoot, 'drafts', `${key}.json`),
        await readFile(resolve(root, 'content/learning/drafts', `${key}.json`)),
      );
      await writeFile(
        resolve(learningRoot, 'evidence', `${key}.visual-delta.json`),
        JSON.stringify({ outsidePolicy: 'PASS' }),
      );
    }
    await action(learningRoot);
  } finally {
    await rm(learningRoot, { recursive: true, force: true });
  }
}

describe('learning manifest hint admission', () => {
  it('records an immutable ladder hash and excludes missing ladders from ranked pinning', async () => {
    await withRepresentativeLearningRoot(async (learningRoot) => {
      const manifest = await buildLearningManifest(learningRoot);
      const admitted = manifest.entries.find(
        (entry) => entry.key === 'en-resilience',
      );
      const missing = manifest.entries.find((entry) => entry.key === 'en-dilemma');
      const bundle = JSON.parse(
        await readFile(
          resolve(learningRoot, 'drafts/en-resilience.json'),
          'utf8',
        ),
      ) as {
        privateSolution: {
          privateSolutionHash: string;
          finalChallenge: {
            canonicalAnswer: string;
            hintUnits: string[];
            hintLadder: unknown[];
            meaning: unknown;
            reviewedHanja?: string;
            hanjaReviewStatus?: string;
          };
        };
      };
      const challenge = bundle.privateSolution.finalChallenge;

      expect(admitted).toMatchObject({
        preferredInputSurface: 'FREE_TEXT',
        assistPattern: 'SPELLING',
        hintLadderAdmission: {
          status: 'ADMITTED',
          stepCount: 5,
          errors: [],
          hash: canonicalJsonSha256({
            category: 'ENGLISH',
            canonicalAnswer: challenge.canonicalAnswer,
            hintUnits: challenge.hintUnits,
            hintLadder: challenge.hintLadder,
            meaning: challenge.meaning,
            reviewedHanja: challenge.reviewedHanja ?? null,
            hanjaReviewStatus: challenge.hanjaReviewStatus ?? null,
            privateSolutionHash: bundle.privateSolution.privateSolutionHash,
          }),
        },
        rankedEligible: true,
      });
      expect(missing).toMatchObject({
        preferredInputSurface: 'FREE_TEXT',
        assistPattern: 'SPELLING',
        hintLadderAdmission: {
          status: 'MISSING',
          stepCount: 0,
          errors: ['MISSING_HINT_LADDER'],
          hash: null,
        },
        rankedEligible: false,
      });
    });
  });

  it('writes exactly the assessed manifest', async () => {
    await withRepresentativeLearningRoot(async (learningRoot) => {
      const expected = await buildLearningManifest(learningRoot);
      const output = resolve(learningRoot, 'manifest.v1.json');

      await writeLearningManifest(learningRoot, output);

      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(expected);
    });
  });

  it('rejects a catalog that bypasses the catalog schema', async () => {
    await withRepresentativeLearningRoot(async (learningRoot) => {
      const catalogPath = resolve(learningRoot, 'catalog.v1.json');
      const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as {
        entries: Array<Record<string, unknown>>;
      };
      catalog.entries[0]!.status = 'APPROVED';
      await writeFile(catalogPath, JSON.stringify(catalog), 'utf8');

      await expect(buildLearningManifest(learningRoot)).rejects.toThrow(
        'INVALID_LEARNING_CATALOGUE',
      );
    });
  });

  it('rejects a draft ladder changed after manifest admission', async () => {
    await withRepresentativeLearningRoot(async (learningRoot) => {
      const manifest = await buildLearningManifest(learningRoot);
      const manifestPath = resolve(learningRoot, 'manifest.v1.json');
      const registryPath = resolve(learningRoot, 'registry.ts');
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
      const draftPath = resolve(learningRoot, 'drafts/en-resilience.json');
      const draft = JSON.parse(await readFile(draftPath, 'utf8')) as {
        privateSolution: {
          finalChallenge: {
            hintLadder: Array<{ localizedText: { ko: string; en: string } }>;
          };
        };
      };
      draft.privateSolution.finalChallenge.hintLadder[0]!.localizedText.en =
        'Changed after admission';
      const { privateSolutionHash: _ignored, ...privateBody } = draft.privateSolution as any;
      (draft.privateSolution as any).privateSolutionHash = canonicalJsonSha256(privateBody);
      await writeFile(draftPath, JSON.stringify(draft), 'utf8');

      await expect(
        generateMobileRegistry({
          manifestPath,
          draftsRoot: resolve(learningRoot, 'drafts'),
          outputPath: registryPath,
        }),
      ).rejects.toThrow('HINT_ADMISSION_DRIFT:en-resilience');
    });
  });

  it('rejects a stale private solution self-hash before generating a snapshot', async () => {
    await withRepresentativeLearningRoot(async (learningRoot) => {
      const manifest = await buildLearningManifest(learningRoot);
      const manifestPath = resolve(learningRoot, 'manifest.v1.json');
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
      const draftPath = resolve(learningRoot, 'drafts/en-resilience.json');
      const draft = JSON.parse(await readFile(draftPath, 'utf8')) as any;
      draft.privateSolution.differences[0].hitboxes.imageA.cx = 0.99;
      await writeFile(draftPath, JSON.stringify(draft), 'utf8');
      await expect(generateMobileRegistry({manifestPath,draftsRoot:resolve(learningRoot,'drafts'),outputPath:resolve(learningRoot,'registry.ts')}))
        .rejects.toThrow('PRIVATE_SOLUTION_HASH_MISMATCH:en-resilience');
    });
  });

  it('rejects category-incompatible answer mode metadata', async () => {
    await withRepresentativeLearningRoot(async (learningRoot) => {
      const manifest = await buildLearningManifest(learningRoot);
      const manifestPath = resolve(learningRoot, 'manifest.v1.json');
      const registryPath = resolve(learningRoot, 'registry.ts');
      (manifest.entries[0] as { assistPattern: string }).assistPattern =
        'INITIAL_PATTERN';
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

      await expect(
        generateMobileRegistry({
          manifestPath,
          draftsRoot: resolve(learningRoot, 'drafts'),
          outputPath: registryPath,
        }),
      ).rejects.toThrow('MODE_METADATA_MISMATCH:en-resilience');
    });
  });

  it('reproduces the committed 79-entry snapshot through manifest and registry', async () => {
    const learningRoot = await mkdtemp(resolve(tmpdir(), 'learning-snapshot-'));
    try {
      await Promise.all(
        ['drafts', 'evidence', 'prompts'].map((directory) =>
          mkdir(resolve(learningRoot, directory), { recursive: true }),
        ),
      );
      const catalogText = await committedFile('content/learning/catalog.v1.json');
      const catalog = JSON.parse(catalogText) as { entries: Array<{ key: string }> };
      expect(catalog.entries).toHaveLength(79);
      await writeFile(resolve(learningRoot, 'catalog.v1.json'), catalogText, 'utf8');
      await Promise.all(
        catalog.entries.flatMap((entry) => [
          committedFile(`content/learning/drafts/${entry.key}.json`).then((draft) =>
            writeFile(resolve(learningRoot, 'drafts', `${entry.key}.json`), draft, 'utf8'),
          ),
          writeFile(
            resolve(learningRoot, 'evidence', `${entry.key}.visual-delta.json`),
            JSON.stringify({ outsidePolicy: 'PASS' }),
            'utf8',
          ),
        ]),
      );

      const manifest = await buildLearningManifest(learningRoot);
      expect(manifest.entries).toHaveLength(79);
      expect(
        manifest.entries.filter((entry) => entry.hintLadderAdmission.status === 'ADMITTED'),
      ).toHaveLength(3);
      expect(
        manifest.entries
          .filter((entry) => entry.hintLadderAdmission.status === 'REJECTED')
          .map((entry) => ({
            key: entry.key,
            errors: entry.hintLadderAdmission.errors,
          })),
      ).toEqual([]);
      expect(
        manifest.entries.filter((entry) => entry.hintLadderAdmission.status === 'MISSING'),
      ).toHaveLength(76);

      const manifestPath = resolve(learningRoot, 'manifest.v1.json');
      const registryPath = resolve(learningRoot, 'registry.ts');
      await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
      await generateMobileRegistry({
        manifestPath,
        draftsRoot: resolve(learningRoot, 'drafts'),
        outputPath: registryPath,
      });
      const registry = await readFile(registryPath, 'utf8');
      expect(registry).toContain(
        "declare const require: (path: string) => import('react-native').ImageSourcePropType;",
      );
      expect(registry.match(/buildDemoEntry\(/g)).toHaveLength(79);
      expect(registry.match(/"hintAdmissionStatus":"ADMITTED"/g)).toHaveLength(3);
      expect(registry.match(/"hintAdmissionStatus":"MISSING"/g)).toHaveLength(76);
      expect(registry).not.toContain('/drafts/');
    } finally {
      await rm(learningRoot, { recursive: true, force: true });
    }
    // Real disk I/O for all 79 entries plus a full manifest and registry build. The reads
    // are already batched; the work is simply larger than the 5s default, and it flakes on
    // a loaded machine. Budgeted explicitly here rather than by raising the global timeout,
    // which would hide genuinely slow tests elsewhere.
  }, 30_000);
});
