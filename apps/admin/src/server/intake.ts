import { createHash } from 'node:crypto';

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
  if (trimmed.includes('../') || trimmed.includes('..\\') || trimmed.includes('/') || trimmed.includes('\0')) {
    throw new Error('UPLOAD_FILENAME');
  }
  const filename = trimmed.replace(/^C:\\fake\\/iu, '').replaceAll('\\', '/').split('/').at(-1)?.toLowerCase();
  if (!filename || !/^[a-z0-9][a-z0-9._-]{0,127}\.json$/u.test(filename) || filename.includes('..')) {
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
