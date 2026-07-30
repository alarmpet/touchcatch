import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ASSET_PUBLISH_LIMITS_V1,
  CONTENT_TEXT_LIMITS_V1,
  HINT_KINDS_V1,
  hintStepV1Schema,
  publicGameContentSchema,
  privateGameSolutionSchema,
  rightsManifestSetSchema,
  type HintStepV1,
} from './content.js';
import { containsDisallowedControl, normalizeFinalAnswer } from './answer-normalization.js';

const root = resolve(import.meta.dirname, '../../..');

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

describe('content contract schemas', () => {
  it.each([
    ['schemas/game-content.public.schema.json', publicGameContentSchema],
    ['schemas/game-content.private.schema.json', privateGameSolutionSchema],
    ['schemas/rights-manifest.schema.json', rightsManifestSetSchema],
  ])('keeps %s byte-structure equivalent to the schema-first constant', async (path, schema) => {
    expect(await readJson(path)).toEqual(schema);
  });

  it('pins publish and shared wire text limits without claiming Task 3 or 4 completion', () => {
    expect(ASSET_PUBLISH_LIMITS_V1).toEqual({
      version: '1.0.0',
      maxEncodedBytes: 8 * 1024 * 1024,
      maxWidth: 4096,
      maxHeight: 4096,
      maxDecodedPixels: 16_000_000,
    });
    expect(CONTENT_TEXT_LIMITS_V1).toEqual({ maxCodePoints: 64, maxUtf8Bytes: 256 });
  });

  it('pins the exact authored-only HintStepV1 contract', () => {
    expect(HINT_KINDS_V1).toEqual([
      'VISUAL_REGION',
      'SEMANTIC_CATEGORY',
      'DEFINITION',
      'CONTEXT_SENTENCE',
      'ANSWER_LENGTH',
      'INITIAL_PATTERN',
      'REVEAL_GRAPHEME',
      'ELIMINATE_OPTION',
    ]);
    expect(hintStepV1Schema).toMatchObject({
      additionalProperties: false,
      required: ['ordinal', 'kind', 'localizedText', 'revealIndexes', 'rankedPenaltyUnits'],
      properties: {
        ordinal: { enum: [1, 2, 3, 4, 5] },
        kind: { enum: HINT_KINDS_V1 },
        rankedPenaltyUnits: { const: 1 },
      },
    });
    expectTypeOf<HintStepV1>().toEqualTypeOf<
      Readonly<{
        ordinal: 1 | 2 | 3 | 4 | 5;
        kind: (typeof HINT_KINDS_V1)[number];
        localizedText: Readonly<Record<'ko' | 'en', string>>;
        revealIndexes: readonly number[];
        rankedPenaltyUnits: 1;
      }>
    >();
  });

  it.each(['en-intermediate.json', 'ko-beginner.json', 'ja-advanced.json'])(
    'carries a distinct five-step ladder and canonical hint units in %s',
    async (name) => {
      const fixture = (await readJson(`content/fixtures/valid/${name}`)) as {
        privateSolution: {
          finalChallenge: {
            canonicalAnswer: string;
            hintUnits: string[];
            hintLadder: HintStepV1[];
          };
        };
      };
      const challenge = fixture.privateSolution.finalChallenge;

      expect(challenge.hintUnits.join('')).toBe(challenge.canonicalAnswer);
      expect(challenge.hintLadder).toHaveLength(5);
      expect(challenge.hintLadder).not.toEqual(challenge.hintUnits);
    },
  );

  it('shares locale-independent answer normalization and rejects C1 controls', () => {
    expect(normalizeFinalAnswer('  ＣＡＴ\u00a0NAME  ')).toBe('cat name');
    expect(containsDisallowedControl('\u0085')).toBe(true);
  });
});
