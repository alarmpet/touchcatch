import { createHash } from 'node:crypto';
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsImport from 'ajv-formats';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import {
  ASSET_PUBLISH_LIMITS_V1,
  CONTENT_CARDINALITY_V1,
  CONTENT_TEXT_LIMITS_V1,
  CONTENT_VALIDATOR_VERSION,
  canonicalJson,
  canonicalJsonSha256,
  containsDisallowedControl,
  normalizeFinalAnswer,
  parseContentAssetOrigins,
  privateGameSolutionSchema,
  publicGameContentSchema,
  rightsManifestSetSchema,
  type ContentValidationError,
  type ContentValidationResult,
} from '../../contracts/src/index.js';

export type ValidationOptions = {
  fixturePath: string;
  assetRoot: string;
  allowedAssetOrigins: readonly string[];
};

export const CONTENT_REQUIREMENT_CASES = {
  'CONTENT-011': [['null-images.json','SCHEMA_PUBLIC']],
  'CONTENT-012': [['revision-mismatch.json','REVISION_MISMATCH'],['private-hash-mismatch.json','PRIVATE_SOLUTION_HASH']],
  'CONTENT-013': [['asset-query-url.json','ASSET_URL_POLICY'],['asset-url-extension-mismatch.json','ASSET_URL_POLICY'],['asset-path-traversal.json','ASSET_URL_POLICY']],
  'CONTENT-014': [['asset-path-traversal.json','ASSET_URL_POLICY']],
  'CONTENT-015': [['declared-hash-mismatch.json','ASSET_HASH_MISMATCH'],['encoded-byte-mismatch.json','ASSET_SIZE_MISMATCH'],['mime-mismatch.json','ASSET_MIME_MISMATCH']],
  'CONTENT-016': [['polyglot-trailing-bytes.json','ASSET_CONTAINER_END'],['truncated-image.json','ASSET_CONTAINER_INVALID'],['animated-apng.json','ANIMATED_ASSET'],['rotated-jpeg.json','ASSET_ORIENTATION'],['oversized-header-dimension.json','ASSET_DIMENSION_LIMIT']],
  'CONTENT-017': [['dimension-mismatch.json','PAIR_DIMENSION_MISMATCH'],['tangent-hitboxes.json','HITBOX_OVERLAP'],['circle-out-of-bounds.json','HITBOX_BOUNDS']],
  'CONTENT-018': [['difficulty-count.json','DIFFERENCE_CARDINALITY'],['word-hunt-count.json','WORD_HUNT_CARDINALITY'],['duplicate-objective-id.json','OBJECTIVE_ID_UNIQUE'],['missing-correct-option.json','CORRECT_OPTION']],
} as const;

type Circle = { cx: number; cy: number; r: number };
type Asset = {
  url: string;
  sha256: string;
  encodedBytes: number;
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
};

const workspaceRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
function configuredAssetOrigins(): readonly string[] {
  const configured = process.env.CONTENT_ASSET_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean);
  if (configured?.length) {
    return parseContentAssetOrigins(configured.join(','));
  }
  if (process.env.NODE_ENV === 'production') throw new Error('CONTENT_ASSET_ORIGINS is required in production');
  return ['https://cdn.spot-learn.test'];
}
const defaultOptions = (fixturePath: string): ValidationOptions => ({
  fixturePath,
  assetRoot: resolve(workspaceRoot, 'content/fixtures/assets'),
  allowedAssetOrigins: configuredAssetOrigins(),
});

// ajv-formats is CommonJS; NodeNext exposes the callable default at runtime
// while its declaration is surfaced as a module namespace by TypeScript.
const addFormats = addFormatsImport as unknown as (instance: Ajv2020) => Ajv2020;
const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
addFormats(ajv);
const validators = {
  publicContent: ajv.compile(publicGameContentSchema),
  privateSolution: ajv.compile(privateGameSolutionSchema),
  rightsManifest: ajv.compile(rightsManifestSetSchema),
};

function addError(errors: ContentValidationError[], path: string, ruleId: string, message: string): void {
  if (!errors.some((error) => error.path === path && error.ruleId === ruleId && error.message === message)) {
    errors.push({ path, ruleId, message });
  }
}

function schemaErrors(
  errors: ContentValidationError[],
  validate: ValidateFunction,
  value: unknown,
  prefix: string,
  ruleId: string,
): boolean {
  if (validate(value)) return true;
  for (const error of validate.errors ?? []) {
    const typed = error as ErrorObject;
    addError(errors, `${prefix}${typed.instancePath || '/'}`, ruleId, typed.message ?? 'schema validation failed');
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textWithinLimit(value: string): boolean {
  return [...value].length <= CONTENT_TEXT_LIMITS_V1.maxCodePoints && Buffer.byteLength(value, 'utf8') <= CONTENT_TEXT_LIMITS_V1.maxUtf8Bytes;
}

function validCircle(value: unknown): value is Circle {
  return isRecord(value) && [value.cx, value.cy, value.r].every((number) => typeof number === 'number' && Number.isFinite(number));
}

function validateCircleBounds(errors: ContentValidationError[], circle: unknown, path: string): void {
  if (!validCircle(circle)) return;
  if (circle.cx - circle.r < 0 || circle.cx + circle.r > 1 || circle.cy - circle.r < 0 || circle.cy + circle.r > 1) {
    addError(errors, path, 'HITBOX_BOUNDS', 'circle must be fully contained in normalized image bounds');
  }
}

function parsePng(bytes: Buffer): { width: number; height: number; animated: boolean; exactEnd: boolean } | undefined {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) return undefined;
  let offset = 8;
  let width = 0;
  let height = 0;
  let animated = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return undefined;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      if (length !== 13) return undefined;
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
    }
    if (type === 'acTL') animated = true;
    if (type === 'IEND') return { width, height, animated, exactEnd: end === bytes.length };
    offset = end;
  }
  return undefined;
}

function jpegExactEnd(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  let inScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      if (!inScan) return false;
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0x00) {
      if (!inScan) return false;
      continue;
    }
    if (marker === 0xd9) return offset === bytes.length;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false;
    offset += segmentLength;
    inScan = marker === 0xda;
  }
  return false;
}

function webpExactEnd(bytes: Buffer): { exact: boolean; animated: boolean } {
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return { exact: false, animated: false };
  }
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) return { exact: false, animated: false };
  let offset = 12;
  let animated = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return { exact: false, animated };
    const chunkType = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkSize;
    const paddedEnd = chunkEnd + (chunkSize % 2);
    if (paddedEnd > bytes.length) return { exact: false, animated };
    if (chunkType === 'ANIM' || chunkType === 'ANMF') animated = true;
    offset = paddedEnd;
  }
  return { exact: offset === bytes.length, animated };
}

function extensionForMime(mime: Asset['mimeType']): readonly string[] {
  if (mime === 'image/png') return ['.png'];
  if (mime === 'image/jpeg') return ['.jpg', '.jpeg'];
  return ['.webp'];
}

async function validateAsset(
  errors: ContentValidationError[],
  asset: unknown,
  locator: unknown,
  path: string,
  options: ValidationOptions,
): Promise<void> {
  if (!isRecord(asset) || typeof asset.url !== 'string' || typeof asset.sha256 !== 'string') return;
  let parsed: URL;
  try {
    parsed = new URL(asset.url);
  } catch {
    addError(errors, `${path}/url`, 'ASSET_URL_POLICY', 'asset URL must be an absolute URL');
    return;
  }
  const rawPath = asset.url.slice(asset.url.indexOf(parsed.host) + parsed.host.length);
  const allowedExtension = /\.(?:png|jpe?g|webp)$/u.test(parsed.pathname);
  const expectedPath = new RegExp(`^/assets/${asset.sha256}\\.(?:png|jpe?g|webp)$`, 'u');
  if (
    parsed.protocol !== 'https:' ||
    !options.allowedAssetOrigins.includes(parsed.origin) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    rawPath.includes('/../') ||
    rawPath.includes('/./') ||
    parsed.pathname.includes('%') ||
    !allowedExtension ||
    !extensionForMime(asset.mimeType).some((extension) => parsed.pathname.endsWith(extension)) ||
    !expectedPath.test(parsed.pathname)
  ) {
    addError(errors, `${path}/url`, 'ASSET_URL_POLICY', 'asset URL must use the pinned CDN origin and immutable hash path without mutable URL components');
    return;
  }
  if (typeof locator !== 'string' || basename(locator) !== locator || locator.includes('/') || locator.includes('\\')) {
    addError(errors, `/assetFiles/${asset.sha256}`, 'ASSET_PATH_POLICY', 'asset locator must be a single canonical filename');
    return;
  }
  const locatorExtension = extname(locator).toLowerCase();
  if (!extensionForMime(asset.mimeType).includes(locatorExtension) || !locator.startsWith(`${asset.sha256}.`)) {
    addError(errors, `/assetFiles/${asset.sha256}`, 'ASSET_PATH_POLICY', 'asset locator filename must contain the declared hash and MIME extension');
    return;
  }

  const rootRealPath = await realpath(options.assetRoot);
  const candidate = resolve(options.assetRoot, locator);
  const relativeCandidate = relative(rootRealPath, candidate);
  if (relativeCandidate.startsWith(`..${sep}`) || relativeCandidate === '..' || relativeCandidate.includes(sep)) {
    addError(errors, `/assetFiles/${asset.sha256}`, 'ASSET_PATH_POLICY', 'asset locator escaped the configured asset root');
    return;
  }
  let metadata;
  try {
    metadata = await lstat(candidate);
  } catch {
    addError(errors, `/assetFiles/${asset.sha256}`, 'ASSET_FILE_MISSING', 'asset file does not exist');
    return;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    addError(errors, `/assetFiles/${asset.sha256}`, 'ASSET_PATH_POLICY', 'asset locator must resolve to a regular non-symlink file');
    return;
  }
  const candidateRealPath = await realpath(candidate);
  if (relative(rootRealPath, candidateRealPath).startsWith('..')) {
    addError(errors, `/assetFiles/${asset.sha256}`, 'ASSET_PATH_POLICY', 'asset real path escaped the configured asset root');
    return;
  }
  if (metadata.size > ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes || asset.encodedBytes > ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes) {
    addError(errors, `${path}/encodedBytes`, 'ASSET_SIZE_LIMIT', 'asset exceeds encoded byte limit');
    return;
  }
  if (metadata.size !== asset.encodedBytes) {
    addError(errors, `${path}/encodedBytes`, 'ASSET_SIZE_MISMATCH', 'declared encoded byte size does not match file');
  }
  const handle = await open(candidateRealPath, 'r');
  let bytes: Buffer;
  try {
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile() || openedMetadata.size > ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes) {
      addError(errors, `${path}/encodedBytes`, 'ASSET_SIZE_LIMIT', 'asset exceeds encoded byte limit');
      return;
    }
    const bounded = Buffer.allocUnsafe(ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes + 1);
    const { bytesRead } = await handle.read(bounded, 0, bounded.length, 0);
    if (bytesRead > ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes) {
      addError(errors, `${path}/encodedBytes`, 'ASSET_SIZE_LIMIT', 'asset exceeds encoded byte limit');
      return;
    }
    bytes = bounded.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== asset.sha256) {
    addError(errors, `${path}/sha256`, 'ASSET_HASH_MISMATCH', 'declared SHA-256 does not match file bytes');
  }

  const sniffed = await fileTypeFromBuffer(bytes);
  if (!sniffed || !['image/png', 'image/apng', 'image/jpeg', 'image/webp'].includes(sniffed.mime)) {
    addError(errors, path, 'ASSET_CONTAINER_INVALID', 'asset magic bytes are missing or unsupported');
    return;
  }
  const png = sniffed.mime === 'image/png' || sniffed.mime === 'image/apng' ? parsePng(bytes) : undefined;
  const webp = sniffed.mime === 'image/webp' ? webpExactEnd(bytes) : undefined;
  if ((sniffed.mime === 'image/png' || sniffed.mime === 'image/apng') && !png) {
    addError(errors, path, 'ASSET_CONTAINER_INVALID', 'PNG container is truncated or malformed');
    return;
  }
  if ((png && !png.exactEnd) || (sniffed.mime === 'image/jpeg' && !jpegExactEnd(bytes)) || (webp && !webp.exact)) {
    addError(errors, path, 'ASSET_CONTAINER_END', 'asset has trailing bytes or a malformed container length');
    return;
  }
  if (sniffed.mime === 'image/apng' || png?.animated || webp?.animated) {
    addError(errors, path, 'ANIMATED_ASSET', 'animated assets are not allowed');
    return;
  }
  if (png && (png.width > ASSET_PUBLISH_LIMITS_V1.maxWidth || png.height > ASSET_PUBLISH_LIMITS_V1.maxHeight || png.width * png.height > ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels)) {
    addError(errors, path, 'ASSET_DIMENSION_LIMIT', 'header dimensions exceed publish limits');
    return;
  }
  if (sniffed.mime !== asset.mimeType) {
    addError(errors, `${path}/mimeType`, 'ASSET_MIME_MISMATCH', 'magic MIME, decoder MIME, and declared MIME must agree');
    return;
  }

  try {
    const image = sharp(bytes, { limitInputPixels: ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels, animated: false, pages: 1 });
    const decoded = await image.metadata();
    if ((decoded.pages ?? 1) !== 1) addError(errors, path, 'ANIMATED_ASSET', 'multi-page assets are not allowed');
    if (decoded.orientation !== undefined && decoded.orientation !== 1) {
      addError(errors, path, 'ASSET_ORIENTATION', 'EXIF orientation must be absent or 1');
    }
    if (decoded.width !== asset.width || decoded.height !== asset.height) {
      addError(errors, path, 'ASSET_DIMENSION_MISMATCH', 'declared dimensions do not match decoded image');
    }
    if (
      !decoded.width ||
      !decoded.height ||
      decoded.width > ASSET_PUBLISH_LIMITS_V1.maxWidth ||
      decoded.height > ASSET_PUBLISH_LIMITS_V1.maxHeight ||
      decoded.width * decoded.height > ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels
    ) {
      addError(errors, path, 'ASSET_DIMENSION_LIMIT', 'decoded dimensions exceed publish limits');
    }
    await image.toBuffer();
  } catch (error) {
    addError(errors, path, 'ASSET_DECODE', error instanceof Error ? error.message : 'asset decode failed');
  }
}

export async function validateFixtureObject(value: unknown, options: ValidationOptions): Promise<ContentValidationResult> {
  const errors: ContentValidationError[] = [];
  if (!isRecord(value)) return { ok: false, errors: [{ path: '/', ruleId: 'SCHEMA_BUNDLE', message: 'fixture must be an object' }] };
  const allowedBundleKeys = ['assetFiles', 'fixtureVersion', 'privateSolution', 'publicContent', 'rightsManifest', 'validatorVersion'];
  for (const key of Object.keys(value)) if (!allowedBundleKeys.includes(key)) addError(errors, `/${key}`, 'SCHEMA_BUNDLE', 'unknown fixture property');
  for (const key of allowedBundleKeys) if (!(key in value)) addError(errors, `/${key}`, 'SCHEMA_BUNDLE', 'required fixture property is missing');
  if (value.fixtureVersion !== '1.0.0' || value.validatorVersion !== CONTENT_VALIDATOR_VERSION) {
    addError(errors, '/', 'SCHEMA_BUNDLE', 'fixture version or validator version is invalid');
  }

  schemaErrors(errors, validators.publicContent, value.publicContent, '/publicContent', 'SCHEMA_PUBLIC');
  schemaErrors(errors, validators.privateSolution, value.privateSolution, '/privateSolution', 'SCHEMA_PRIVATE');
  schemaErrors(errors, validators.rightsManifest, value.rightsManifest, '/rightsManifest', 'SCHEMA_RIGHTS');

  const publicContent = isRecord(value.publicContent) ? value.publicContent : {};
  const privateSolution = isRecord(value.privateSolution) ? value.privateSolution : {};
  const rightsManifest = isRecord(value.rightsManifest) ? value.rightsManifest : {};
  const assetFiles = isRecord(value.assetFiles) ? value.assetFiles : {};

  if (publicContent.contentRevisionId !== privateSolution.contentRevisionId) {
    addError(errors, '/privateSolution/contentRevisionId', 'REVISION_MISMATCH', 'public and private revision IDs must match');
  }
  if (isRecord(value.privateSolution)) {
    const { privateSolutionHash, ...hashablePrivateSolution } = value.privateSolution;
    if (typeof privateSolutionHash !== 'string' || canonicalJsonSha256(hashablePrivateSolution) !== privateSolutionHash) {
      addError(errors, '/privateSolution/privateSolutionHash', 'PRIVATE_SOLUTION_HASH', 'private solution self-excluding canonical hash does not match');
    }
  }

  const differences = Array.isArray(privateSolution.differences) ? privateSolution.differences : [];
  const normalCount = differences.filter((entry) => isRecord(entry) && entry.tier === 'NORMAL').length;
  const hardCount = differences.filter((entry) => isRecord(entry) && entry.tier === 'HARD').length;
  if (normalCount !== CONTENT_CARDINALITY_V1.normalDifferences || hardCount !== CONTENT_CARDINALITY_V1.hardDifferences) addError(errors, '/privateSolution/differences', 'DIFFERENCE_CARDINALITY', `differences must contain ${CONTENT_CARDINALITY_V1.normalDifferences} NORMAL and ${CONTENT_CARDINALITY_V1.hardDifferences} HARD objectives`);
  const wordHunts = Array.isArray(privateSolution.wordHunts) ? privateSolution.wordHunts : [];
  const normalWords = wordHunts.filter((entry) => isRecord(entry) && entry.kind === 'NORMAL').length;
  const specialWords = wordHunts.filter((entry) => isRecord(entry) && entry.kind === 'SPECIAL').length;
  if (wordHunts.length !== CONTENT_CARDINALITY_V1.wordHunts || normalWords !== CONTENT_CARDINALITY_V1.wordHunts - 1 || specialWords !== 1) addError(errors, '/privateSolution/wordHunts', 'WORD_HUNT_CARDINALITY', `word hunts must contain ${CONTENT_CARDINALITY_V1.wordHunts - 1} NORMAL and 1 SPECIAL objectives`);

  const objectives = [...differences, ...wordHunts, ...(isRecord(privateSolution.suddenDeath) ? [privateSolution.suddenDeath] : [])];
  const ids = objectives.map((entry) => isRecord(entry) ? (entry.objectiveId ?? entry.missionId) : undefined).filter((id): id is string => typeof id === 'string');
  if (new Set(ids).size !== ids.length) addError(errors, '/privateSolution', 'OBJECTIVE_ID_UNIQUE', 'all objective IDs, including sudden death, must be unique');

  for (const side of ['imageA', 'imageB'] as const) {
    const circles: { circle: Circle; path: string }[] = [];
    objectives.forEach((objective, index) => {
      const circle = isRecord(objective) && isRecord(objective.hitboxes) ? objective.hitboxes[side] : undefined;
      const path = `/privateSolution/objectives/${index}/hitboxes/${side}`;
      validateCircleBounds(errors, circle, path);
      if (validCircle(circle)) circles.push({ circle, path });
    });
    for (let left = 0; left < circles.length; left += 1) {
      for (let right = left + 1; right < circles.length; right += 1) {
        const a = circles[left]!.circle;
        const b = circles[right]!.circle;
        const distanceSquared = (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
        if (distanceSquared <= (a.r + b.r) ** 2) addError(errors, circles[right]!.path, 'HITBOX_OVERLAP', 'hitboxes may not overlap or be tangent');
      }
    }
  }

  const finalChallenge = isRecord(privateSolution.finalChallenge) ? privateSolution.finalChallenge : {};
  const canonical = typeof finalChallenge.canonicalAnswer === 'string' ? finalChallenge.canonicalAnswer : '';
  const language = typeof publicContent.language === 'string' ? publicContent.language : 'en';
  if (canonical !== normalizeFinalAnswer(canonical) || !textWithinLimit(canonical)) addError(errors, '/privateSolution/finalChallenge/canonicalAnswer', 'FINAL_ANSWER_LIMIT', 'canonical answer must be normalized and within shared wire limits');
  const aliases = Array.isArray(finalChallenge.aliases) ? finalChallenge.aliases.filter((alias): alias is string => typeof alias === 'string') : [];
  const normalizedAliases = aliases.map((alias) => normalizeFinalAnswer(alias));
  if (normalizedAliases.some((alias) => alias === normalizeFinalAnswer(canonical) || !textWithinLimit(alias)) || new Set(normalizedAliases).size !== normalizedAliases.length) {
    addError(errors, '/privateSolution/finalChallenge/aliases', 'FINAL_ANSWER_ALIAS_UNIQUE', 'aliases must normalize to unique values distinct from canonical answer');
  }
  const hintUnits = Array.isArray(finalChallenge.hintUnits) ? finalChallenge.hintUnits : [];
  const expectedUnits = [...new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(canonical)].map((part) => part.segment);
  if (
    hintUnits.some((unit) => typeof unit !== 'string' || unit.length === 0 || containsDisallowedControl(unit)) ||
    hintUnits.join('') !== canonical ||
    JSON.stringify(hintUnits) !== JSON.stringify(expectedUnits)
  ) {
    addError(errors, '/privateSolution/finalChallenge/hintUnits', 'HINT_SEGMENTATION', 'hint units must exactly match grapheme segmentation and contain no controls');
  }
  const meaning = isRecord(finalChallenge.meaning) ? finalChallenge.meaning : {};
  const optionsList = Array.isArray(meaning.options) ? meaning.options : [];
  const correctMatches = optionsList.filter((option) => isRecord(option) && option.id === meaning.correctOptionId).length;
  if (correctMatches !== 1) addError(errors, '/privateSolution/finalChallenge/meaning/correctOptionId', 'CORRECT_OPTION', 'correctOptionId must identify exactly one option');

  const entries = Array.isArray(rightsManifest.entries) ? rightsManifest.entries.filter(isRecord) : [];
  const rightsIds = entries.map((entry) => entry.rightsRecordId).filter((id): id is string => typeof id === 'string');
  const rightsHashes = entries.map((entry) => entry.assetSha256).filter((hash): hash is string => typeof hash === 'string');
  if (new Set(rightsIds).size !== rightsIds.length) addError(errors, '/rightsManifest/entries', 'RIGHTS_RECORD_UNIQUE', 'rights record IDs must be unique');
  if (new Set(rightsHashes).size !== rightsHashes.length) addError(errors, '/rightsManifest/entries', 'RIGHTS_HASH_UNIQUE', 'rights asset hashes must be unique');
  for (const [index, entry] of entries.entries()) {
    const prompt = isRecord(entry.prompt) ? entry.prompt : {};
    if ((prompt.available === false && (prompt.sha256 !== null || prompt.unavailabilityReason !== 'NOT_AVAILABLE')) || (prompt.available === true && (typeof prompt.sha256 !== 'string' || prompt.unavailabilityReason !== null))) {
      addError(errors, `/rightsManifest/entries/${index}/prompt`, 'PROMPT_STATE', 'prompt availability fields are inconsistent');
    }
    const rights = isRecord(entry.rights) ? entry.rights : {};
    const education = isRecord(entry.education) ? entry.education : {};
    if (rights.status !== 'APPROVED' || typeof rights.licenseOrPermission !== 'string' || typeof rights.approverId !== 'string' || typeof rights.approvedAt !== 'string' || education.status !== 'APPROVED' || typeof education.reviewerId !== 'string' || typeof education.reviewedAt !== 'string') {
      addError(errors, `/rightsManifest/entries/${index}`, 'RIGHTS_NOT_APPROVED', 'rights and education reviews must both be approved with audit metadata');
    }
  }

  const assets = [publicContent.imageA, publicContent.imageB].filter((asset): asset is Asset => isRecord(asset)) as Asset[];
  const publicHashes = assets.map((asset) => asset.sha256).filter((hash): hash is string => typeof hash === 'string');
  if (new Set(publicHashes).size !== publicHashes.length || [...publicHashes].sort().join(',') !== [...rightsHashes].sort().join(',') || [...publicHashes].sort().join(',') !== Object.keys(assetFiles).sort().join(',')) {
    addError(errors, '/rightsManifest/entries', 'RIGHTS_ASSET_BIJECTION', 'public assets, rights entries, and local locators must be an exact SHA-256 bijection');
  }
  if (isRecord(publicContent.imageA) && isRecord(publicContent.imageB) && (publicContent.imageA.width !== publicContent.imageB.width || publicContent.imageA.height !== publicContent.imageB.height)) {
    addError(errors, '/publicContent/imageB', 'PAIR_DIMENSION_MISMATCH', 'image A and B dimensions must match');
  }
  await Promise.all(assets.map((asset, index) => validateAsset(errors, asset, assetFiles[asset.sha256], `/publicContent/image${index === 0 ? 'A' : 'B'}`, options)));

  errors.sort((a, b) => a.path.localeCompare(b.path) || a.ruleId.localeCompare(b.ruleId) || a.message.localeCompare(b.message));
  if (errors.length > 0) return { ok: false, errors };
  const { privateSolutionHash, ...hashablePrivateSolution } = value.privateSolution;
  const publicContentCanonicalJson = canonicalJson(value.publicContent);
  const privateSolutionCanonicalJson = canonicalJson(hashablePrivateSolution);
  const rightsManifestCanonicalJson = canonicalJson(value.rightsManifest);
  return {
    ok: true,
    value: {
      publicContent: value.publicContent,
      privateSolution: value.privateSolution,
      rightsManifest: value.rightsManifest,
      publicContentCanonicalJson,
      privateSolutionCanonicalJson,
      rightsManifestCanonicalJson,
      publicContentHash: createHash('sha256').update(publicContentCanonicalJson).digest('hex'),
      privateSolutionHash,
      rightsManifestHash: createHash('sha256').update(rightsManifestCanonicalJson).digest('hex'),
    },
  } as ContentValidationResult;
}

export async function validateFixtureFile(path: string): Promise<ContentValidationResult> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return { ok: false, errors: [{ path: '/', ruleId: 'SCHEMA_BUNDLE', message: error instanceof Error ? error.message : 'fixture parse failed' }] };
  }
  return validateFixtureObject(value, defaultOptions(path));
}

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) throw new Error('usage: validate-content <fixture-directory>');
  const directory = resolve(input);
  const files = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  let failures = 0;
  for (const file of files) {
    const result = await validateFixtureFile(resolve(directory, file));
    if (!result.ok) {
      failures += 1;
      console.error(`${file}: ${JSON.stringify(result.errors)}`);
    }
  }
  if (failures > 0) throw new Error(`${failures} content fixtures failed validation`);
  console.log(`${files.length} valid revisions, 0 errors`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
