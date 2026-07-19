import type { FromSchema } from 'json-schema-to-ts';
import frozenRuleset from '../../../config/ruleset.v1.json' with { type: 'json' };

export const CONTENT_CARDINALITY_V1 = frozenRuleset.content;

export const CONTENT_CONTRACT_VERSION = '1.0.0' as const;
export const CONTENT_VALIDATOR_VERSION = '1.0.0' as const;

export const CONTENT_TEXT_LIMITS_V1 = {
  maxCodePoints: 64,
  maxUtf8Bytes: 256,
} as const;

export function isWithinContentTextLimits(value: string): boolean {
  return (
    [...value].length <= CONTENT_TEXT_LIMITS_V1.maxCodePoints &&
    Buffer.byteLength(value, 'utf8') <= CONTENT_TEXT_LIMITS_V1.maxUtf8Bytes
  );
}

export const ASSET_PUBLISH_LIMITS_V1 = {
  version: '1.0.0',
  maxEncodedBytes: 8 * 1024 * 1024,
  maxWidth: 4096,
  maxHeight: 4096,
  maxDecodedPixels: 16_000_000,
} as const;

const idPattern = '^[a-z0-9][a-z0-9_-]{0,127}$';
const sha256Pattern = '^[a-f0-9]{64}$';

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
      minItems: CONTENT_CARDINALITY_V1.normalDifferences + CONTENT_CARDINALITY_V1.hardDifferences,
      maxItems: CONTENT_CARDINALITY_V1.normalDifferences + CONTENT_CARDINALITY_V1.hardDifferences,
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
        meaning: {
          type: 'object',
          additionalProperties: false,
          required: ['prompt', 'options', 'correctOptionId'],
          properties: {
            prompt: { type: 'string', minLength: 1, maxLength: 256 },
            options: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
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
