import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { canonicalJsonSha256 } from '../packages/contracts/src/canonical-json.js';

const root = resolve('content/fixtures');
const assetRoot = resolve(root, 'assets');
const validRoot = resolve(root, 'valid');
const invalidRoot = resolve(root, 'invalid');
const hashes = [
  '80141f74c0f7353bba31d9952bdbeb4d715716065b6cff2e591f94fa3763129e',
  '59ab13e90d337af02e94c8c9dbfd8aff8dbd54b203acfe768a3641e0b70ab189',
  '90fce90a3fd50fb9ea665634fc3d5651452ec44369e5375c7e2197c2c5211b18',
  'ef5e490dc05917a3178974d74ace212b1e981803ffb3b3747a12498e35bf5949',
];

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const clone = <T>(value: T): T => structuredClone(value);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function insertApngControl(png: Buffer): Buffer {
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8);
  const data = Buffer.alloc(8);
  data.writeUInt32BE(2, 0);
  data.writeUInt32BE(0, 4);
  return Buffer.concat([png.subarray(0, ihdrEnd), pngChunk('acTL', data), png.subarray(ihdrEnd)]);
}

function rewritePngWidth(png: Buffer, width: number): Buffer {
  const output = Buffer.from(png);
  output.writeUInt32BE(width, 16);
  const typeAndData = output.subarray(12, 29);
  output.writeUInt32BE(crc32(typeAndData), 29);
  return output;
}

function appendWebpChunk(webp: Buffer, type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32LE(data.length, 4);
  const output = Buffer.concat([webp, header, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  output.writeUInt32LE(output.length - 8, 4);
  return output;
}

const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];
const contentIds = [
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
];
const variants = [
  { file: 'ko-beginner.json', language: 'ko', difficulty: 'BEGINNER', answer: '고양이', aliases: ['냥이'], prompt: '고양이의 뜻은?', options: ['동물', '식물', '장소'] },
  { file: 'en-intermediate.json', language: 'en', difficulty: 'INTERMEDIATE', answer: 'cat', aliases: ['feline'], prompt: 'What does cat mean?', options: ['animal', 'plant', 'place'] },
  { file: 'ja-advanced.json', language: 'ja', difficulty: 'ADVANCED', answer: 'ねこ', aliases: ['ネコ'], prompt: 'ねこの意味は?', options: ['動物', '植物', '場所'] },
] as const;

async function descriptor(hash: string) {
  const path = resolve(assetRoot, `${hash}.png`);
  const info = await stat(path);
  const metadata = await sharp(path, { limitInputPixels: 16_000_000 }).metadata();
  return {
    url: `https://cdn.spot-learn.test/assets/${hash}.png`,
    sha256: hash,
    encodedBytes: info.size,
    width: metadata.width,
    height: metadata.height,
    mimeType: 'image/png',
  };
}

function rightsEntry(hash: string, index: number) {
  return {
    rightsRecordId: `rights_${index}`,
    assetSha256: hash,
    source: { kind: 'OWNED', sourceRecordId: `source_${index}`, sourceUri: `https://rights.spot-learn.test/source/${index}` },
    generator: { provider: 'UNKNOWN', model: 'UNKNOWN', modelVersion: 'UNKNOWN', termsVersion: 'UNKNOWN', generatedAt: '2026-07-16T00:00:00.000Z' },
    prompt: { available: false, sha256: null, unavailabilityReason: 'NOT_AVAILABLE' },
    rights: { status: 'APPROVED', licenseOrPermission: 'Internal test fixture', approverId: 'test-rights-reviewer', approvedAt: '2026-07-16T00:00:00.000Z' },
    education: { status: 'APPROVED', reviewerId: 'test-education-reviewer', reviewedAt: '2026-07-16T00:00:00.000Z' },
    takedown: { ownerId: 'content-ops', contact: 'content-ops@spot-learn.test', runbookVersion: '1.0.0' },
  };
}

async function buildFixture(index: number) {
  const variant = variants[index]!;
  const pair = [hashes[index]!, hashes[index + 1]!] as const;
  const points = Array.from({ length: 14 }, (_, point) => ({
    cx: 0.1 + (point % 5) * 0.2,
    cy: 0.1 + Math.floor(point / 5) * 0.28,
    r: 0.03,
  }));
  const privateSolutionBody = {
    contentRevisionId: ids[index],
    schemaVersion: '1.0.0',
    differences: Array.from({ length: 10 }, (_, objective) => ({
      objectiveId: `difference_${objective + 1}`,
      tier: objective < 7 ? 'NORMAL' : 'HARD',
      hitboxes: { imageA: points[objective], imageB: points[objective] },
    })),
    wordHunts: Array.from({ length: 3 }, (_, objective) => ({
      missionId: `word_${objective + 1}`,
      kind: objective < 2 ? 'NORMAL' : 'SPECIAL',
      publicPrompt: `word prompt ${objective + 1}`,
      hitboxes: { imageA: points[10 + objective], imageB: points[10 + objective] },
    })),
    suddenDeath: { objectiveId: 'sudden_death_1', hitboxes: { imageA: points[13], imageB: points[13] } },
    finalChallenge: {
      canonicalAnswer: variant.answer,
      aliases: [...variant.aliases],
      hintUnits: [...new Intl.Segmenter(variant.language, { granularity: 'grapheme' }).segment(variant.answer)].map((part) => part.segment),
      meaning: {
        prompt: variant.prompt,
        options: variant.options.map((label, option) => ({ id: `option_${option + 1}`, label })),
        correctOptionId: 'option_1',
      },
    },
  };
  const privateSolution = { ...privateSolutionBody, privateSolutionHash: canonicalJsonSha256(privateSolutionBody) };
  return {
    fixtureVersion: '1.0.0',
    validatorVersion: '1.0.0',
    publicContent: {
      contentId: contentIds[index],
      version: 1,
      contentRevisionId: ids[index],
      schemaVersion: '1.0.0',
      assetPolicyVersion: '1.0.0',
      theme: `fixture-theme-${index + 1}`,
      language: variant.language,
      difficulty: variant.difficulty,
      imageA: await descriptor(pair[0]),
      imageB: await descriptor(pair[1]),
    },
    privateSolution,
    rightsManifest: { schemaVersion: '1.0.0', manifestSetId: `rights_set_${index + 1}`, entries: [rightsEntry(pair[0], index * 2 + 1), rightsEntry(pair[1], index * 2 + 2)] },
    assetFiles: { [pair[0]]: `${pair[0]}.png`, [pair[1]]: `${pair[1]}.png` },
  };
}

function replaceFirstAsset(fixture: any, oldHash: string, newHash: string, file: string, patch: Record<string, unknown> = {}) {
  fixture.publicContent.imageA = {
    ...fixture.publicContent.imageA,
    sha256: newHash,
    url: `https://cdn.spot-learn.test/assets/${newHash}.${file.split('.').at(-1)}`,
    ...patch,
  };
  fixture.rightsManifest.entries[0].assetSha256 = newHash;
  delete fixture.assetFiles[oldHash];
  fixture.assetFiles[newHash] = file;
}

await mkdir(validRoot, { recursive: true });
await mkdir(invalidRoot, { recursive: true });
const valid = await Promise.all([0, 1, 2].map(buildFixture));
for (let index = 0; index < valid.length; index += 1) {
  await writeFile(resolve(validRoot, variants[index]!.file), `${JSON.stringify(valid[index], null, 2)}\n`, 'utf8');
}

const sourcePng = await readFile(resolve(assetRoot, `${hashes[0]}.png`));
await writeFile(resolve(assetRoot, `${'a'.repeat(64)}.png`), sourcePng);
const generated = new Map<string, { bytes: Buffer; extension: string; patch: Record<string, unknown> }>();
const polyglot = Buffer.concat([sourcePng, Buffer.from('POLYGLOT_TRAILER', 'ascii')]);
generated.set('polyglot-trailing-bytes.json', { bytes: polyglot, extension: 'png', patch: { encodedBytes: polyglot.length } });
const truncated = sourcePng.subarray(0, 96);
generated.set('truncated-image.json', { bytes: truncated, extension: 'png', patch: { encodedBytes: truncated.length } });
const animated = insertApngControl(sourcePng);
generated.set('animated-apng.json', { bytes: animated, extension: 'png', patch: { encodedBytes: animated.length } });
const hugeHeader = rewritePngWidth(sourcePng, 5000);
generated.set('oversized-header-dimension.json', { bytes: hugeHeader, extension: 'png', patch: { encodedBytes: hugeHeader.length, width: 5000 } });
const normalJpeg = await sharp(sourcePng).jpeg({ quality: 90 }).toBuffer();
generated.set('mime-mismatch.json', { bytes: normalJpeg, extension: 'png', patch: { encodedBytes: normalJpeg.length, mimeType: 'image/png' } });
const jpegPolyglot = Buffer.concat([normalJpeg, Buffer.from('TRAILING_PAYLOAD', 'ascii'), Buffer.from([0xff, 0xd9])]);
generated.set('jpeg-polyglot-trailing-bytes.json', { bytes: jpegPolyglot, extension: 'jpg', patch: { encodedBytes: jpegPolyglot.length, mimeType: 'image/jpeg' } });
const rotatedJpeg = await sharp(sourcePng).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer();
generated.set('rotated-jpeg.json', { bytes: rotatedJpeg, extension: 'jpg', patch: { encodedBytes: rotatedJpeg.length, mimeType: 'image/jpeg' } });
const animatedWebp = appendWebpChunk(await sharp(sourcePng).webp().toBuffer(), 'ANIM', Buffer.alloc(6));
generated.set('animated-webp.json', { bytes: animatedWebp, extension: 'webp', patch: { encodedBytes: animatedWebp.length, mimeType: 'image/webp' } });

for (const [name, artifact] of generated) {
  const hash = sha256(artifact.bytes);
  await writeFile(resolve(assetRoot, `${hash}.${artifact.extension}`), artifact.bytes);
  const fixture = clone(valid[0]);
  replaceFirstAsset(fixture, hashes[0]!, hash, `${hash}.${artifact.extension}`, artifact.patch);
  await writeFile(resolve(invalidRoot, name), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

const invalid = new Map<string, (fixture: any) => void>([
  ['null-images.json', (f) => { f.publicContent.imageA = null; }],
  ['empty-final-answer.json', (f) => { f.privateSolution.finalChallenge.canonicalAnswer = ''; }],
  ['oversized-answer.json', (f) => { f.privateSolution.finalChallenge.canonicalAnswer = 'a'.repeat(65); f.privateSolution.finalChallenge.hintUnits = ['a'.repeat(65)]; }],
  ['invalid-coordinate.json', (f) => { f.privateSolution.differences[0].hitboxes.imageA.cx = -0.01; }],
  ['duplicate-objective-id.json', (f) => { f.privateSolution.wordHunts[0].missionId = f.privateSolution.differences[0].objectiveId; }],
  ['difficulty-count.json', (f) => { f.privateSolution.differences[7].tier = 'NORMAL'; }],
  ['word-hunt-count.json', (f) => { f.privateSolution.wordHunts.pop(); }],
  ['dimension-mismatch.json', (f) => { f.publicContent.imageB.width -= 1; }],
  ['tangent-hitboxes.json', (f) => { const a = f.privateSolution.differences[0].hitboxes.imageA; f.privateSolution.differences[1].hitboxes.imageA = { cx: a.cx + a.r * 2, cy: a.cy, r: a.r }; }],
  ['missing-correct-option.json', (f) => { f.privateSolution.finalChallenge.meaning.correctOptionId = 'not_present'; }],
  ['hint-concat-mismatch.json', (f) => { f.privateSolution.finalChallenge.hintUnits.pop(); }],
  ['duplicate-alias.json', (f) => { f.privateSolution.finalChallenge.aliases = [` ${f.privateSolution.finalChallenge.canonicalAnswer.toUpperCase()} `]; }],
  ['oversized-alias.json', (f) => { f.privateSolution.finalChallenge.aliases = ['😀'.repeat(65)]; }],
  ['missing-sudden-death.json', (f) => { delete f.privateSolution.suddenDeath; }],
  ['unapproved-rights.json', (f) => { f.rightsManifest.entries[0].rights.status = 'REVIEW_REQUIRED'; f.rightsManifest.entries[0].rights.approverId = null; f.rightsManifest.entries[0].rights.approvedAt = null; }],
  ['duplicate-rights-hash.json', (f) => { f.rightsManifest.entries[1].assetSha256 = f.rightsManifest.entries[0].assetSha256; }],
  ['missing-rights-entry.json', (f) => { f.rightsManifest.entries.pop(); }],
  ['extra-rights-entry.json', (f) => { const entry = clone(f.rightsManifest.entries[0]); entry.rightsRecordId = 'rights_extra'; entry.assetSha256 = 'b'.repeat(64); f.rightsManifest.entries.push(entry); }],
  ['asset-query-url.json', (f) => { f.publicContent.imageA.url += '?token=mutable'; }],
  ['asset-url-extension-mismatch.json', (f) => { f.publicContent.imageA.url = f.publicContent.imageA.url.replace(/\.png$/, '.jpg'); }],
  ['asset-path-traversal.json', (f) => { f.publicContent.imageA.url = `https://cdn.spot-learn.test/assets/../${hashes[0]}.png`; }],
  ['declared-hash-mismatch.json', (f) => { const fake = 'a'.repeat(64); replaceFirstAsset(f, hashes[0]!, fake, `${fake}.png`); }],
  ['revision-mismatch.json', (f) => { f.privateSolution.contentRevisionId = ids[1]; }],
  ['private-hash-mismatch.json', (f) => { f.privateSolution.privateSolutionHash = 'c'.repeat(64); }],
  ['prompt-state.json', (f) => { f.rightsManifest.entries[0].prompt.sha256 = 'd'.repeat(64); }],
  ['circle-out-of-bounds.json', (f) => { f.privateSolution.differences[0].hitboxes.imageA = { cx: 0.01, cy: 0.1, r: 0.03 }; }],
  ['oversized-encoded.json', (f) => { f.publicContent.imageA.encodedBytes = 8_388_609; }],
  ['encoded-byte-mismatch.json', (f) => { f.publicContent.imageA.encodedBytes -= 1; }],
  ['hint-control-character.json', (f) => { f.privateSolution.finalChallenge.hintUnits[0] = '\u0000'; }],
  ['missing-provenance.json', (f) => { delete f.rightsManifest.entries[0].generator.termsVersion; }],
]);

for (const [name, mutate] of invalid) {
  const fixture = clone(valid[0]);
  mutate(fixture);
  await writeFile(resolve(invalidRoot, name), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
}

console.log(`wrote ${valid.length} valid fixtures and ${invalid.size + generated.size} invalid fixtures`);
