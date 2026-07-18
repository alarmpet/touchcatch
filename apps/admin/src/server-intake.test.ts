import { describe, expect, it } from 'vitest';
import { intakeUpload } from './server/intake.js';

describe('admin upload intake', () => {
  it('accepts only an already-normalized basename and recomputes the byte hash', () => {
    const bytes = Buffer.from('{"fixtureVersion":"1.0.0"}');
    const value = intakeUpload({ filename: 'content.json', mimeType: 'application/json', bytes, clientStoragePath: '../../private' });
    expect(value).toEqual({ filename: 'content.json', mimeType: 'application/json', encodedBytes: bytes.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/u), bytes });
    expect(value).not.toHaveProperty('clientStoragePath');
    expect(() => intakeUpload({ filename: ' C:\\fake\\content.JSON ', mimeType: 'application/json', bytes })).toThrow('UPLOAD_FILENAME');
  });

  it('rejects unsupported type, extension, path tricks and oversized input', () => {
    expect(() => intakeUpload({ filename: 'x.png', mimeType: 'image/png', bytes: Buffer.from('x') })).toThrow('UPLOAD_TYPE');
    expect(() => intakeUpload({ filename: '../x.json', mimeType: 'application/json', bytes: Buffer.from('{}') })).toThrow('UPLOAD_FILENAME');
    expect(() => intakeUpload({ filename: 'x.json', mimeType: 'application/json', bytes: Buffer.alloc(1_048_577) })).toThrow('UPLOAD_SIZE');
  });
});
