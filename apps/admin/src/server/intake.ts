import 'server-only';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { ASSET_PUBLISH_LIMITS_V1 } from '../../../../packages/contracts/src/index.js';

export const ADMIN_UPLOAD_MAX_BYTES = 1_048_576;

export type UploadInput = {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  clientStoragePath?: string;
};

export function intakeUpload(input: UploadInput) {
  if (input.mimeType !== 'application/json') throw new Error('UPLOAD_TYPE');
  if (input.bytes.byteLength > ADMIN_UPLOAD_MAX_BYTES) throw new Error('UPLOAD_SIZE');
  const trimmed = input.filename.trim();
  if (trimmed !== input.filename || trimmed.includes('../') || trimmed.includes('..\\') || trimmed.includes('/') || trimmed.includes('\0')) {
    throw new Error('UPLOAD_FILENAME');
  }
  const filename = trimmed.replace(/^C:\\fake\\/u, '').replaceAll('\\', '/').split('/').at(-1);
  if (!filename || !/^[a-z0-9][a-z0-9_-]{0,127}\.json$/u.test(filename)) {
    throw new Error('UPLOAD_FILENAME');
  }
  return {
    filename,
    mimeType: 'application/json' as const,
    encodedBytes: input.bytes.byteLength,
    sha256: createHash('sha256').update(input.bytes).digest('hex'),
    bytes: input.bytes,
  };
}

const ASSET_MAX_BYTES = ASSET_PUBLISH_LIMITS_V1.maxEncodedBytes;
const MIME_EXTENSION = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' } as const;
function magicMatches(bytes: Buffer, mime: keyof typeof MIME_EXTENSION): boolean {
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}
async function boundedFile(form: FormData, field: string, allowed: readonly string[], max: number): Promise<File> {
  const value = form.get(field);
  if (!(value instanceof File) || !allowed.includes(value.type) || value.size < 1 || value.size > max) throw new Error(`UPLOAD_${field.toUpperCase()}_INVALID`);
  return value;
}
export async function intakeMultipart(form: FormData) {
  if ([...form.keys()].sort().join(',') !== 'artifact,imageA,imageB') throw new Error('UPLOAD_FIELDS');
  const artifactFile = await boundedFile(form, 'artifact', ['application/json'], ADMIN_UPLOAD_MAX_BYTES);
  intakeUpload({ filename: artifactFile.name, mimeType: artifactFile.type, bytes: Buffer.from(await artifactFile.arrayBuffer()) });
  const artifactBytes = Buffer.from(await artifactFile.arrayBuffer());
  let artifact: unknown;
  try { artifact = JSON.parse(artifactBytes.toString('utf8')); } catch { throw new Error('UPLOAD_JSON_INVALID'); }
  const assets = {} as Record<'imageA' | 'imageB', { locator: string; mimeType: keyof typeof MIME_EXTENSION; bytes: Buffer; sha256: string; width: number; height: number }>;
  for (const side of ['imageA', 'imageB'] as const) {
    const file = await boundedFile(form, side, Object.keys(MIME_EXTENSION), ASSET_MAX_BYTES);
    const mimeType = file.type as keyof typeof MIME_EXTENSION;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!magicMatches(bytes, mimeType)) throw new Error(`UPLOAD_${side.toUpperCase()}_MAGIC`);
    const suppliedExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!(mimeType === 'image/jpeg' ? ['.jpg', '.jpeg'] : [MIME_EXTENSION[mimeType]]).includes(suppliedExtension)) throw new Error(`UPLOAD_${side.toUpperCase()}_EXTENSION`);
    let metadata;
    try { metadata = await sharp(bytes, { animated: false, pages: 1, limitInputPixels: ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels }).metadata(); } catch { throw new Error(`UPLOAD_${side.toUpperCase()}_DECODE`); }
    const width = metadata.width ?? 0; const height = metadata.height ?? 0;
    if (!width || !height || width > ASSET_PUBLISH_LIMITS_V1.maxWidth || height > ASSET_PUBLISH_LIMITS_V1.maxHeight || width * height > ASSET_PUBLISH_LIMITS_V1.maxDecodedPixels || (metadata.pages ?? 1) !== 1) throw new Error(`UPLOAD_${side.toUpperCase()}_DIMENSIONS`);
    assets[side] = { locator: `upload_${randomBytes(18).toString('base64url')}${MIME_EXTENSION[mimeType]}`, mimeType, bytes, sha256: createHash('sha256').update(bytes).digest('hex'), width, height };
  }
  return { artifact, artifactSha256: createHash('sha256').update(artifactBytes).digest('hex'), assets };
}
