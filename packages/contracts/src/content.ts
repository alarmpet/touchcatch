import type { FromSchema } from 'json-schema-to-ts';
import frozenRuleset from '../../../config/ruleset.v1.json' with { type: 'json' };
import contentValidationPolicy from '../../../config/content-validation-policy.v1.json' with { type: 'json' };
import { containsDisallowedControl, normalizeFinalAnswer } from './answer-normalization.js';

export const CONTENT_CARDINALITY_V1 = frozenRuleset.content;

export const CONTENT_CONTRACT_VERSION = '1.0.0' as const;
export const CONTENT_VALIDATOR_VERSION = '1.0.0' as const;

export const CONTENT_TEXT_LIMITS_V1 = {
  maxCodePoints: 64,
  maxUtf8Bytes: 256,
} as const;

export const RAW_FINAL_ANSWER_LIMITS_V1 = {
  maxCodePoints: 128,
  maxUtf8Bytes: 256,
} as const;

export function isWithinContentTextLimits(value: string): boolean {
  return (
    [...value].length <= CONTENT_TEXT_LIMITS_V1.maxCodePoints &&
    Buffer.byteLength(value, 'utf8') <= CONTENT_TEXT_LIMITS_V1.maxUtf8Bytes
  );
}

export function isHintRevealableGrapheme(value: string): boolean {
  return !/^[\p{White_Space}\p{Punctuation}]+$/u.test(value);
}

export function isValidFinalAnswerSubmission(value: string): boolean {
  if ([...value].length > RAW_FINAL_ANSWER_LIMITS_V1.maxCodePoints || Buffer.byteLength(value, 'utf8') > RAW_FINAL_ANSWER_LIMITS_V1.maxUtf8Bytes || containsDisallowedControl(value)) return false;
  const normalized = normalizeFinalAnswer(value);
  return normalized.length > 0 && isWithinContentTextLimits(normalized) && !containsDisallowedControl(normalized);
}

export const ASSET_PUBLISH_LIMITS_V1 = {
  version: contentValidationPolicy.version,
  ...contentValidationPolicy.assetLimits,
} as const;

const idPattern = '^[a-z0-9][a-z0-9_-]{0,127}$';
const sha256Pattern = '^[a-f0-9]{64}$';

export const HINT_KINDS_V1 = [
  'VISUAL_REGION',
  'SEMANTIC_CATEGORY',
  'DEFINITION',
  'CONTEXT_SENTENCE',
  'ANSWER_LENGTH',
  'INITIAL_PATTERN',
  'REVEAL_GRAPHEME',
  'ELIMINATE_OPTION',
] as const;

export type HintKind = (typeof HINT_KINDS_V1)[number];
export const PUBLIC_HINT_REGIONS_V1 = [
  'TOP_LEFT',
  'TOP_RIGHT',
  'BOTTOM_LEFT',
  'BOTTOM_RIGHT',
  'CENTER',
] as const;
export type PublicHintRegionV1 =
  | Readonly<{ kind:'REGION'; imageSide:'A'|'B'; region:(typeof PUBLIC_HINT_REGIONS_V1)[number] }>
  | Readonly<{ kind:'EXACT_CIRCLE'; imageSide:'A'|'B'; centerX:number; centerY:number; radius:number }>;
export type HintStepV1 = Readonly<{
  ordinal: 1 | 2 | 3 | 4 | 5;
  kind: HintKind;
  localizedText: Readonly<Record<'ko' | 'en', string>>;
  revealIndexes: readonly number[];
  rankedPenaltyUnits: 1;
  publicRegion?: PublicHintRegionV1;
}>;

export const publicHintRegionV1Schema = {
  oneOf: [
    {type:'object',additionalProperties:false,required:['kind','imageSide','region'],properties:{kind:{const:'REGION'},imageSide:{enum:['A','B']},region:{enum:PUBLIC_HINT_REGIONS_V1}}},
    {type:'object',additionalProperties:false,required:['kind','imageSide','centerX','centerY','radius'],properties:{kind:{const:'EXACT_CIRCLE'},imageSide:{enum:['A','B']},centerX:{type:'number',minimum:0,maximum:1},centerY:{type:'number',minimum:0,maximum:1},radius:{type:'number',exclusiveMinimum:0,maximum:.25}}},
  ],
} as const;

export const hintStepV1Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['ordinal', 'kind', 'localizedText', 'revealIndexes', 'rankedPenaltyUnits'],
  properties: {
    ordinal: { enum: [1, 2, 3, 4, 5] },
    kind: { enum: HINT_KINDS_V1 },
    localizedText: {
      type: 'object',
      additionalProperties: false,
      required: ['ko', 'en'],
      properties: {
        ko: { type: 'string', minLength: 1, maxLength: 512 },
        en: { type: 'string', minLength: 1, maxLength: 512 },
      },
    },
    revealIndexes: {
      type: 'array',
      minItems: 0,
      maxItems: 64,
      uniqueItems: true,
      items: { type: 'integer', minimum: 0, maximum: 63 },
    },
    rankedPenaltyUnits: { const: 1 },
    publicRegion: publicHintRegionV1Schema,
  },
  allOf: [
    {
      if: { properties: { kind: { const: 'VISUAL_REGION' } }, required: ['kind'] },
      then: {
        type: 'object',
        required: ['publicRegion'],
        properties: { publicRegion: publicHintRegionV1Schema },
      },
      else: {
        type: 'object',
        properties: { publicRegion: false },
      },
    },
    {
      if: {
        properties: { kind: { const: 'VISUAL_REGION' }, ordinal: { const: 5 } },
        required: ['kind', 'ordinal'],
      },
      then: {
        type: 'object',
        properties: {
          publicRegion: {
            type: 'object',
            properties: { kind: { const: 'EXACT_CIRCLE' } },
          },
        },
      },
    },
    {
      if: {
        properties: { kind: { const: 'VISUAL_REGION' }, ordinal: { enum: [1, 2, 3, 4] } },
        required: ['kind', 'ordinal'],
      },
      then: {
        type: 'object',
        properties: {
          publicRegion: {
            type: 'object',
            properties: { kind: { const: 'REGION' } },
          },
        },
      },
    },
  ],
} as const;

const assetSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['url', 'sha256', 'encodedBytes', 'width', 'height', 'mimeType'],
  properties: {
    url: { type: 'string', format: 'uri', minLength: 1, maxLength: 2048 },
    sha256: { type: 'string', pattern: sha256Pattern },
    encodedBytes: { type: 'integer', minimum: 1, maximum: ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes },
    width: { type: 'integer', minimum: 1, maximum: ASSET_PUBLISH_LIMITS_V1.maxWidth },
    height: { type: 'integer', minimum: 1, maximum: ASSET_PUBLISH_LIMITS_V1.maxHeight },
    mimeType: { enum: ['image/png', 'image/jpeg', 'image/webp'] },
  },
} as const;

const circleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cx', 'cy', 'r'],
  properties: {
    cx: { type: 'number', minimum: 0, maximum: 1 },
    cy: { type: 'number', minimum: 0, maximum: 1 },
    r: { type: 'number', exclusiveMinimum: 0, maximum: 0.25 },
  },
} as const;

const pairedHitboxesSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['imageA', 'imageB'],
  properties: { imageA: circleSchema, imageB: circleSchema },
} as const;

export const publicGameContentSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.spot-learn.test/game-content.public.v1.schema.json',
  title: 'PublicGameContentV1',
  type: 'object',
  additionalProperties: false,
  required: [
    'contentId',
    'version',
    'contentRevisionId',
    'schemaVersion',
    'assetPolicyVersion',
    'theme',
    'category',
    'language',
    'difficulty',
    'imageA',
    'imageB',
  ],
  properties: {
    contentId: { type: 'string', format: 'uuid' },
    version: { type: 'integer', minimum: 1 },
    contentRevisionId: { type: 'string', format: 'uuid' },
    schemaVersion: { const: '1.0.0' },
    assetPolicyVersion: { const: '1.0.0' },
    theme: { type: 'string', minLength: 1, maxLength: 120 },
    category: { enum: ['ENGLISH', 'PROVERB', 'IDIOM', 'GENERAL_KNOWLEDGE'] },
    language: { enum: ['ko', 'en', 'ja'] },
    difficulty: { enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] },
    imageA: assetSchema,
    imageB: assetSchema,
  },
} as const;

export const privateGameSolutionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.spot-learn.test/game-content.private.v1.schema.json',
  title: 'PrivateGameSolutionV1',
  type: 'object',
  additionalProperties: false,
  required: [
    'contentRevisionId',
    'schemaVersion',
    'privateSolutionHash',
    'differences',
    'wordHunts',
    'suddenDeath',
    'finalChallenge',
  ],
  properties: {
    contentRevisionId: { type: 'string', format: 'uuid' },
    schemaVersion: { const: '1.0.0' },
    privateSolutionHash: { type: 'string', pattern: sha256Pattern },
    differences: {
      type: 'array',
      minItems: CONTENT_CARDINALITY_V1.minDifferences,
      maxItems: CONTENT_CARDINALITY_V1.maxDifferences,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['objectiveId', 'tier', 'hitboxes'],
        properties: {
          objectiveId: { type: 'string', pattern: idPattern },
          tier: { enum: ['NORMAL', 'HARD'] },
          hitboxes: pairedHitboxesSchema,
        },
      },
    },
    wordHunts: {
      type: 'array',
      minItems: CONTENT_CARDINALITY_V1.wordHunts,
      maxItems: CONTENT_CARDINALITY_V1.wordHunts,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['missionId', 'kind', 'publicPrompt', 'hitboxes'],
        properties: {
          missionId: { type: 'string', pattern: idPattern },
          kind: { enum: ['NORMAL', 'SPECIAL'] },
          publicPrompt: { type: 'string', minLength: 1, maxLength: 120 },
          hitboxes: pairedHitboxesSchema,
        },
      },
    },
    suddenDeath: {
      type: 'object',
      additionalProperties: false,
      required: ['objectiveId', 'hitboxes'],
      properties: {
        objectiveId: { type: 'string', pattern: idPattern },
        hitboxes: pairedHitboxesSchema,
      },
    },
    finalChallenge: {
      type: 'object',
      additionalProperties: false,
      required: ['canonicalAnswer', 'aliases', 'hintUnits', 'meaning'],
      dependentRequired: {
        reviewedHanja: ['hanjaReviewStatus'],
        hanjaReviewStatus: ['reviewedHanja'],
      },
      properties: {
        canonicalAnswer: { type: 'string', minLength: 1, maxLength: 256 },
        aliases: {
          type: 'array',
          maxItems: 16,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 256 },
        },
        hintUnits: {
          type: 'array',
          minItems: 1,
          maxItems: 64,
          items: { type: 'string', minLength: 1, maxLength: 32 },
        },
        hintLadder: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: hintStepV1Schema,
        },
        reviewedHanja: { type: 'string', minLength: 1, maxLength: 64 },
        hanjaReviewStatus: { enum: ['REVIEW_REQUIRED', 'APPROVED', 'REJECTED'] },
        meaning: {
          type: 'object',
          additionalProperties: false,
          required: ['prompt', 'options', 'correctOptionId'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 256 },
            options: {
              type: 'array',
              minItems: 3,
              maxItems: 4,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'label'],
                properties: {
                  id: { type: 'string', pattern: idPattern },
                  label: { type: 'string', minLength: 1, maxLength: 256 },
                },
              },
            },
            correctOptionId: { type: 'string', pattern: idPattern },
          },
        },
      },
    },
  },
} as const;

const nullableNonEmptyString = { type: ['string', 'null'], minLength: 1, maxLength: 2048 } as const;

const rightsEntrySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'rightsRecordId',
    'assetSha256',
    'source',
    'generator',
    'prompt',
    'rights',
    'education',
    'takedown',
  ],
  properties: {
    rightsRecordId: { type: 'string', pattern: idPattern },
    assetSha256: { type: 'string', pattern: sha256Pattern },
    source: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'sourceRecordId', 'sourceUri'],
      properties: {
        kind: { enum: ['AI_GENERATED', 'LICENSED', 'OWNED', 'UNKNOWN'] },
        sourceRecordId: { type: 'string', minLength: 1, maxLength: 256 },
        sourceUri: { type: 'string', format: 'uri', minLength: 1, maxLength: 2048 },
      },
    },
    generator: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'model', 'modelVersion', 'termsVersion', 'generatedAt'],
      properties: {
        provider: { type: 'string', minLength: 1, maxLength: 120 },
        model: { type: 'string', minLength: 1, maxLength: 120 },
        modelVersion: { type: 'string', minLength: 1, maxLength: 120 },
        termsVersion: { type: 'string', minLength: 1, maxLength: 120 },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
    prompt: {
      type: 'object',
      additionalProperties: false,
      required: ['available', 'sha256', 'unavailabilityReason'],
      properties: {
        available: { type: 'boolean' },
        sha256: { type: ['string', 'null'], pattern: sha256Pattern },
        unavailabilityReason: nullableNonEmptyString,
      },
    },
    rights: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'licenseOrPermission', 'approverId', 'approvedAt'],
      properties: {
        status: { enum: ['REVIEW_REQUIRED', 'APPROVED', 'REJECTED'] },
        licenseOrPermission: nullableNonEmptyString,
        approverId: nullableNonEmptyString,
        approvedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    education: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'reviewerId', 'reviewedAt'],
      properties: {
        status: { enum: ['REVIEW_REQUIRED', 'APPROVED', 'REJECTED'] },
        reviewerId: nullableNonEmptyString,
        reviewedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    takedown: {
      type: 'object',
      additionalProperties: false,
      required: ['ownerId', 'contact', 'runbookVersion'],
      properties: {
        ownerId: { type: 'string', minLength: 1, maxLength: 120 },
        contact: { type: 'string', minLength: 1, maxLength: 256 },
        runbookVersion: { type: 'string', minLength: 1, maxLength: 120 },
      },
    },
  },
} as const;

export const rightsManifestSetSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.spot-learn.test/rights-manifest.v1.schema.json',
  title: 'RightsManifestSetV1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'manifestSetId', 'entries'],
  properties: {
    schemaVersion: { const: '1.0.0' },
    manifestSetId: { type: 'string', pattern: idPattern },
    entries: { type: 'array', minItems: 1, items: rightsEntrySchema },
  },
} as const;

export type PublicGameContentV1 = FromSchema<typeof publicGameContentSchema>;
export type PrivateGameSolutionV1 = FromSchema<typeof privateGameSolutionSchema>;
export type RightsManifestSetV1 = FromSchema<typeof rightsManifestSetSchema>;
export type RightsManifestV1 = RightsManifestSetV1['entries'][number];

export type ContentFixtureBundleV1 = {
  fixtureVersion: '1.0.0';
  validatorVersion: '1.0.0';
  publicContent: PublicGameContentV1;
  privateSolution: PrivateGameSolutionV1;
  rightsManifest: RightsManifestSetV1;
  assetFiles: Record<string, string>;
};

export type ContentValidationError = { path: string; ruleId: string; message: string };
export type ContentValidationResult =
  | {
      ok: true;
      value: {
        publicContent: PublicGameContentV1;
        privateSolution: PrivateGameSolutionV1;
        rightsManifest: RightsManifestSetV1;
        publicContentCanonicalJson: string;
        privateSolutionCanonicalJson: string;
        rightsManifestCanonicalJson: string;
        publicContentHash: string;
        privateSolutionHash: string;
        rightsManifestHash: string;
      };
    }
  | { ok: false; errors: ContentValidationError[] };

// Task 5 owns only the content contract. Future Task 3/4 implementations must import
// these limits and types instead of declaring a second private or wire shape.
import clientRuntimePolicy from '../../../config/client-runtime-policy.v1.json' with {type:'json'};
export const RECOMMENDED_IMAGE_LONG_EDGE_PX=clientRuntimePolicy.recommendedImageLongEdgePx;
