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
  type PublicHintRegionV1,
} from './content.js';
import { containsDisallowedControl, normalizeFinalAnswer } from './answer-normalization.js';
import { Ajv2020 } from 'ajv/dist/2020.js';

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

  it('pins the authored HintStepV1 contract and its public-safe visual descriptor', () => {
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
        publicRegion?: PublicHintRegionV1;
      }>
    >();
  });

  it('admits only an enumerated public visual region and cannot encode private circles', () => {
    const validate = new Ajv2020().compile(hintStepV1Schema);
    const base = {
      ordinal: 1,
      kind: 'VISUAL_REGION',
      localizedText: { ko: '왼쪽 위를 보세요', en: 'Look toward the top left' },
      revealIndexes: [],
      rankedPenaltyUnits: 1,
    };

    expect(validate({
      ...base,
      publicRegion: { imageSide: 'A', region: 'TOP_LEFT' },
    })).toBe(true);
    expect(validate({
      ...base,
      kind: 'DEFINITION',
      publicRegion: { imageSide: 'A', region: 'TOP_LEFT' },
    })).toBe(false);
    expect(validate({
      ...base,
      publicRegion: { imageSide: 'A', region: 'TOP_LEFT', cx: 0.1, cy: 0.2, r: 0.03 },
    })).toBe(false);
  });

  it.each([[512,true],[513,false]] as const)('counts %i astral localized characters as JSON Schema code points', (count, valid) => {
    const validate = new Ajv2020().compile(hintStepV1Schema);
    expect(validate({ordinal:1,kind:'DEFINITION',localizedText:{ko:'😀'.repeat(count),en:'😀'.repeat(count)},revealIndexes:[],rankedPenaltyUnits:1})).toBe(valid);
  });

  it('keeps ladders and reviewed Hanja optional for legacy private bundles', () => {
    const finalChallenge = privateGameSolutionSchema.properties.finalChallenge;

    expect(finalChallenge.required).toEqual([
      'canonicalAnswer',
      'aliases',
      'hintUnits',
      'meaning',
    ]);
    expect(finalChallenge.properties.hintLadder).toMatchObject({
      minItems: 5,
      maxItems: 5,
    });
    expect(finalChallenge.properties.meaning.properties.options).toMatchObject({
      minItems: 3,
      maxItems: 4,
    });
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
