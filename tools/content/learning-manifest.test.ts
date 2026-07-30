import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import {
  buildLearningManifest,
  writeLearningManifest,
} from './learning-manifest.js';

const root = resolve(import.meta.dirname, '../..');

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
      ) as { privateSolution: { finalChallenge: { hintLadder: unknown[] } } };

      expect(admitted).toMatchObject({
        hintLadderAdmission: {
          status: 'ADMITTED',
          stepCount: 5,
          errors: [],
          hash: canonicalJsonSha256(
            bundle.privateSolution.finalChallenge.hintLadder,
          ),
        },
        rankedEligible: true,
      });
      expect(missing).toMatchObject({
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
});
