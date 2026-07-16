import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { validateFixtureFile, validateFixtureObject } from './validate-content.js';
import { canonicalJsonSha256 } from '../../contracts/src/canonical-json.js';

const root = resolve(import.meta.dirname, '../../..');
const validDir = resolve(root, 'content/fixtures/valid');
const invalidDir = resolve(root, 'content/fixtures/invalid');

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function padPngToExactBytes(png: Buffer, targetBytes: number, marker: string): Buffer {
  const iendOffset = png.length - 12;
  const dataLength = targetBytes - png.length - 12;
  if (dataLength < marker.length) throw new Error('target is too small for PNG padding');
  const type = Buffer.from('tEXt');
  const data = Buffer.alloc(dataLength, 0x20);
  data.write(marker, 0, 'ascii');
  const chunk = Buffer.alloc(12 + dataLength);
  chunk.writeUInt32BE(dataLength, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + dataLength);
  return Buffer.concat([png.subarray(0, iendOffset), chunk, png.subarray(iendOffset)]);
}

async function validateWithGeneratedAssets(
  width: number,
  height: number,
  transform?: (png: Buffer, side: 'A' | 'B') => Buffer,
) {
  const assetRoot = await mkdtemp(resolve(tmpdir(), 'touchcatch-assets-'));
  try {
    const fixture = JSON.parse(await readFile(resolve(validDir, 'ko-beginner.json'), 'utf8')) as any;
    fixture.assetFiles = {};
    fixture.rightsManifest.entries = [];
    for (const side of ['A', 'B'] as const) {
      const raw = await sharp({
        create: { width, height, channels: 3, background: side === 'A' ? '#112233' : '#334455' },
      }).png({ compressionLevel: 9 }).toBuffer();
      const bytes = transform ? transform(raw, side) : raw;
      const hash = createHash('sha256').update(bytes).digest('hex');
      const file = `${hash}.png`;
      await writeFile(resolve(assetRoot, file), bytes);
      fixture.assetFiles[hash] = file;
      fixture.publicContent[`image${side}`] = {
        url: `https://cdn.spot-learn.test/assets/${file}`,
        sha256: hash,
        encodedBytes: bytes.length,
        width,
        height,
        mimeType: 'image/png',
      };
      const rights = JSON.parse(JSON.stringify((JSON.parse(await readFile(resolve(validDir, 'ko-beginner.json'), 'utf8')) as any).rightsManifest.entries[side === 'A' ? 0 : 1]));
      rights.rightsRecordId = `generated-boundary-${side.toLowerCase()}`;
      rights.assetSha256 = hash;
      fixture.rightsManifest.entries.push(rights);
    }
    return await validateFixtureObject(fixture, {
      fixturePath: resolve(validDir, 'ko-beginner.json'),
      assetRoot,
      allowedAssetOrigins: ['https://cdn.spot-learn.test'],
    });
  } finally {
    await rm(assetRoot, { recursive: true, force: true });
  }
}

describe('content publish validator', () => {
  it.each(['ko-beginner.json', 'en-intermediate.json', 'ja-advanced.json'])(
    'accepts approved fixture %s',
    async (name) => {
      const result = await validateFixtureFile(resolve(validDir, name));
      expect(result).toMatchObject({ ok: true });
    },
  );

  it.each([
    ['null-images.json', 'SCHEMA_PUBLIC'],
    ['empty-final-answer.json', 'SCHEMA_PRIVATE'],
    ['oversized-answer.json', 'FINAL_ANSWER_LIMIT'],
    ['invalid-coordinate.json', 'SCHEMA_PRIVATE'],
    ['duplicate-objective-id.json', 'OBJECTIVE_ID_UNIQUE'],
    ['difficulty-count.json', 'DIFFERENCE_CARDINALITY'],
    ['word-hunt-count.json', 'WORD_HUNT_CARDINALITY'],
    ['dimension-mismatch.json', 'PAIR_DIMENSION_MISMATCH'],
    ['tangent-hitboxes.json', 'HITBOX_OVERLAP'],
    ['missing-correct-option.json', 'CORRECT_OPTION'],
    ['hint-concat-mismatch.json', 'HINT_SEGMENTATION'],
    ['duplicate-alias.json', 'FINAL_ANSWER_ALIAS_UNIQUE'],
    ['oversized-alias.json', 'FINAL_ANSWER_ALIAS_UNIQUE'],
    ['missing-sudden-death.json', 'SCHEMA_PRIVATE'],
    ['unapproved-rights.json', 'RIGHTS_NOT_APPROVED'],
    ['duplicate-rights-hash.json', 'RIGHTS_HASH_UNIQUE'],
    ['missing-rights-entry.json', 'RIGHTS_ASSET_BIJECTION'],
    ['asset-query-url.json', 'ASSET_URL_POLICY'],
    ['asset-url-extension-mismatch.json', 'ASSET_URL_POLICY'],
    ['asset-path-traversal.json', 'ASSET_URL_POLICY'],
    ['declared-hash-mismatch.json', 'ASSET_HASH_MISMATCH'],
    ['polyglot-trailing-bytes.json', 'ASSET_CONTAINER_END'],
    ['jpeg-polyglot-trailing-bytes.json', 'ASSET_CONTAINER_END'],
    ['truncated-image.json', 'ASSET_CONTAINER_INVALID'],
    ['animated-apng.json', 'ANIMATED_ASSET'],
    ['animated-webp.json', 'ANIMATED_ASSET'],
    ['oversized-header-dimension.json', 'ASSET_DIMENSION_LIMIT'],
    ['mime-mismatch.json', 'ASSET_MIME_MISMATCH'],
    ['rotated-jpeg.json', 'ASSET_ORIENTATION'],
    ['revision-mismatch.json', 'REVISION_MISMATCH'],
    ['private-hash-mismatch.json', 'PRIVATE_SOLUTION_HASH'],
    ['prompt-state.json', 'PROMPT_STATE'],
    ['circle-out-of-bounds.json', 'HITBOX_BOUNDS'],
    ['oversized-encoded.json', 'SCHEMA_PUBLIC'],
    ['encoded-byte-mismatch.json', 'ASSET_SIZE_MISMATCH'],
    ['hint-control-character.json', 'HINT_SEGMENTATION'],
    ['missing-provenance.json', 'SCHEMA_RIGHTS'],
    ['extra-rights-entry.json', 'RIGHTS_ASSET_BIJECTION'],
  ])('rejects %s at named rule %s', async (name, ruleId) => {
    const result = await validateFixtureFile(resolve(invalidDir, name));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.ruleId)).toContain(ruleId);
  });

  it('rejects an asset locator outside the configured fixture root before reading it', async () => {
    const fixture = JSON.parse(
      await readFile(resolve(validDir, 'ko-beginner.json'), 'utf8'),
    ) as { assetFiles: Record<string, string> };
    const [firstHash] = Object.keys(fixture.assetFiles);
    expect(firstHash).toBeDefined();
    fixture.assetFiles[firstHash!] = '../outside.png';
    const result = await validateFixtureObject(fixture, {
      fixturePath: resolve(validDir, 'ko-beginner.json'),
      assetRoot: resolve(root, 'content/fixtures/assets'),
      allowedAssetOrigins: ['https://cdn.spot-learn.test'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.ruleId)).toContain('ASSET_PATH_POLICY');
  });

  it('accepts the exact shared 64-code-point and 256-byte answer boundary', async () => {
    const fixture = JSON.parse(await readFile(resolve(validDir, 'ko-beginner.json'), 'utf8')) as any;
    const answer = '😀'.repeat(64);
    fixture.privateSolution.finalChallenge.canonicalAnswer = answer;
    fixture.privateSolution.finalChallenge.hintUnits = Array.from(answer);
    const { privateSolutionHash: _oldHash, ...hashable } = fixture.privateSolution;
    fixture.privateSolution.privateSolutionHash = canonicalJsonSha256(hashable);
    const result = await validateFixtureObject(fixture, {
      fixturePath: resolve(validDir, 'ko-beginner.json'),
      assetRoot: resolve(root, 'content/fixtures/assets'),
      allowedAssetOrigins: ['https://cdn.spot-learn.test'],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts real PNG assets at the exact 16,000,000 decoded-pixel boundary', async () => {
    expect(await validateWithGeneratedAssets(4000, 4000)).toEqual({ ok: true, value: expect.any(Object) });
  });

  it('accepts real PNG assets one pixel below the decoded-pixel boundary', async () => {
    expect(await validateWithGeneratedAssets(3999, 4001)).toEqual({ ok: true, value: expect.any(Object) });
  });

  it('rejects real PNG assets one pixel-row beyond the decoded-pixel boundary', async () => {
    const result = await validateWithGeneratedAssets(4000, 4001);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.ruleId)).toContain('ASSET_DIMENSION_LIMIT');
  });

  it('accepts width 4096 when the decoded-pixel ceiling is still respected', async () => {
    expect(await validateWithGeneratedAssets(4096, 3906)).toEqual({ ok: true, value: expect.any(Object) });
  });

  it('rejects width 4097 independently of the decoded-pixel ceiling', async () => {
    const result = await validateWithGeneratedAssets(4097, 32);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.ruleId)).toContain('ASSET_DIMENSION_LIMIT');
  });

  it('accepts a valid PNG container one byte below the 8 MiB encoded-byte boundary', async () => {
    const result = await validateWithGeneratedAssets(32, 32, (png, side) =>
      padPngToExactBytes(png, 8 * 1024 * 1024 - 1, `below-boundary-${side}`),
    );
    expect(result).toEqual({ ok: true, value: expect.any(Object) });
  });

  it('accepts a valid PNG container at the exact 8 MiB encoded-byte boundary', async () => {
    const result = await validateWithGeneratedAssets(32, 32, (png, side) =>
      padPngToExactBytes(png, 8 * 1024 * 1024, `boundary-${side}`),
    );
    expect(result).toEqual({ ok: true, value: expect.any(Object) });
  });

  it('rejects a valid PNG container one byte beyond the 8 MiB encoded-byte boundary', async () => {
    const result = await validateWithGeneratedAssets(32, 32, (png, side) =>
      padPngToExactBytes(png, 8 * 1024 * 1024 + 1, `over-boundary-${side}`),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.ruleId)).toContain('ASSET_SIZE_LIMIT');
  });

  it('short-circuits before container inspection when the actual file exceeds 8 MiB', async () => {
    const result = await validateWithGeneratedAssets(32, 32, () => Buffer.alloc(8 * 1024 * 1024 + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.ruleId)).toContain('ASSET_SIZE_LIMIT');
      expect(result.errors.map((error) => error.ruleId)).not.toContain('ASSET_CONTAINER_INVALID');
    }
  });
});
