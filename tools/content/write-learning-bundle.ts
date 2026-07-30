import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import type { HintStepV1 } from '../../packages/contracts/src/content.js';
import {
  segmentAnswer,
  validateHintLadder,
  type HintCategory,
  type HintLanguage,
} from '../../packages/content-validator/src/hint-ladder.js';
import type { DeltaRegion } from './visual-delta.js';

type Meaning = {
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
};

export type LearningBundleInput = {
  key: string;
  category: HintCategory;
  language: HintLanguage;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  canonicalAnswer: string;
  aliases: string[];
  hintLadder: readonly HintStepV1[];
  reviewedHanja?: string;
  hanjaReviewStatus?: 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
  meaning: Meaning;
};

export type LearningGeometry = {
  differences?: Array<DeltaRegion & { tier: 'NORMAL' | 'HARD' }>;
  wordHunts?: Array<
    DeltaRegion & { kind: 'NORMAL' | 'SPECIAL'; publicPrompt: string }
  >;
  suddenDeath?: DeltaRegion;
};

const sha = async (file: string) =>
  createHash('sha256').update(await readFile(file)).digest('hex');

const uuid = (value: string) => {
  const hash = createHash('sha256').update(value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

async function descriptor(file: string) {
  const [hash, info, metadata] = await Promise.all([
    sha(file),
    stat(file),
    sharp(file).metadata(),
  ]);
  if (!metadata.width || !metadata.height || metadata.format !== 'png') {
    throw new Error('LEARNING_ASSET_MUST_BE_PNG');
  }
  return {
    url: `https://cdn.spot-learn.test/assets/${hash}.png`,
    sha256: hash,
    encodedBytes: info.size,
    width: metadata.width,
    height: metadata.height,
    mimeType: 'image/png' as const,
  };
}

function validateAuthoredLadder(entry: LearningBundleInput): void {
  if (!Array.isArray(entry.hintLadder)) throw new Error('MISSING_AUTHORED_HINT_LADDER');
  const errors = validateHintLadder(
    entry.category,
    entry.canonicalAnswer,
    entry.hintLadder,
    {
      ...(entry.reviewedHanja ? { reviewedHanja: entry.reviewedHanja } : {}),
      ...(entry.hanjaReviewStatus
        ? { hanjaReviewStatus: entry.hanjaReviewStatus }
        : {}),
      meaning: entry.meaning,
    },
  );
  if (errors.length > 0) throw new Error(`INVALID_HINT_LADDER:${errors.join(',')}`);
}

export async function writeLearningBundle(
  entry: LearningBundleInput,
  imageA: string,
  imageB: string,
  output: string,
  geometry: LearningGeometry = {},
) {
  validateAuthoredLadder(entry);
  const [assetA, assetB] = await Promise.all([
    descriptor(imageA),
    descriptor(imageB),
  ]);
  if (assetA.width !== assetB.width || assetA.height !== assetB.height) {
    throw new Error('PAIR_DIMENSION_MISMATCH');
  }

  const revision = uuid(`${entry.key}:${assetA.sha256}:${assetB.sha256}`);
  const finalChallenge = {
    canonicalAnswer: entry.canonicalAnswer,
    aliases: entry.aliases,
    hintUnits: segmentAnswer(entry.canonicalAnswer, entry.language).hintUnits,
    hintLadder: entry.hintLadder,
    ...(entry.reviewedHanja === undefined
      ? {}
      : { reviewedHanja: entry.reviewedHanja }),
    ...(entry.hanjaReviewStatus === undefined
      ? {}
      : { hanjaReviewStatus: entry.hanjaReviewStatus }),
    meaning: entry.meaning,
  };
  const body = {
    contentRevisionId: revision,
    schemaVersion: '1.0.0',
    differences: (geometry.differences ?? []).map((region) => ({
      objectiveId: region.id,
      tier: region.tier,
      hitboxes: {
        imageA: { cx: region.cx, cy: region.cy, r: region.r },
        imageB: { cx: region.cx, cy: region.cy, r: region.r },
      },
    })),
    wordHunts: (geometry.wordHunts ?? []).map((region) => ({
      missionId: region.id,
      kind: region.kind,
      publicPrompt: region.publicPrompt,
      hitboxes: {
        imageA: { cx: region.cx, cy: region.cy, r: region.r },
        imageB: { cx: region.cx, cy: region.cy, r: region.r },
      },
    })),
    suddenDeath: geometry.suddenDeath
      ? {
          objectiveId: geometry.suddenDeath.id,
          hitboxes: {
            imageA: {
              cx: geometry.suddenDeath.cx,
              cy: geometry.suddenDeath.cy,
              r: geometry.suddenDeath.r,
            },
            imageB: {
              cx: geometry.suddenDeath.cx,
              cy: geometry.suddenDeath.cy,
              r: geometry.suddenDeath.r,
            },
          },
        }
      : null,
    finalChallenge,
  };
  const result = {
    schemaVersion: '1.0.0',
    status: 'DRAFT',
    rightsReviewStatus: 'REVIEW_REQUIRED',
    educationReviewStatus: 'REVIEW_REQUIRED',
    publicContent: {
      contentId: uuid(entry.key),
      version: 1,
      contentRevisionId: revision,
      schemaVersion: '1.0.0',
      assetPolicyVersion: '1.0.0',
      theme: entry.key,
      category: entry.category,
      language: entry.language,
      difficulty: entry.difficulty,
      imageA: assetA,
      imageB: assetB,
    },
    privateSolution: {
      ...body,
      privateSolutionHash: canonicalJsonSha256(body),
    },
    assetFiles: {
      [assetA.sha256]: imageA,
      [assetB.sha256]: imageB,
    },
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}
