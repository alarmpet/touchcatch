import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSET_PUBLISH_LIMITS_V1,
  CONTENT_TEXT_LIMITS_V1,
  publicGameContentSchema,
  privateGameSolutionSchema,
  rightsManifestSetSchema,
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

  it('shares locale-independent answer normalization and rejects C1 controls', () => {
    expect(normalizeFinalAnswer('  ＣＡＴ\u00a0NAME  ')).toBe('cat name');
    expect(containsDisallowedControl('\u0085')).toBe(true);
  });
});
