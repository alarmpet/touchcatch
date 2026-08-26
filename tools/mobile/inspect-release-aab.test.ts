import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The inspector is the last thing that reads the artifact before it is uploaded, and it is the
 * only check in this repository that reads the built binary rather than the source. If its zip
 * reader is wrong it reports PASS on a bundle it never actually opened, which is worse than not
 * running it.
 *
 * So these build real zips -- an .aab is a zip -- and assert on the verdict.
 */

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'aab-inspect-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Writes a zip with the given entries. Deflated, so the reader's inflate path is exercised. */
function writeZip(name: string, entries: ReadonlyArray<readonly [string, string]>): string {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [entryName, content] of entries) {
    const nameBytes = Buffer.from(entryName, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, compressed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(raw.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  const file = path.join(workDir, name);
  writeFileSync(file, Buffer.concat([...chunks, centralBuffer, eocd]));
  return file;
}

type Report = {
  verdict: 'PASS' | 'FAIL';
  failures: string[];
  abis: string[];
  sha256: string;
};

function inspect(file: string, extra: string[] = []): Report {
  try {
    const stdout = execFileSync(
      process.execPath,
      ['tools/mobile/inspect-release-aab.mjs', '--aab', file, '--json', ...extra],
      { encoding: 'utf8' },
    );
    return JSON.parse(stdout) as Report;
  } catch (error) {
    // Non-zero exit is the normal outcome for a failing bundle; the report is still on stdout.
    const stdout = (error as { stdout?: string }).stdout ?? '';
    return JSON.parse(stdout) as Report;
  }
}

const cleanManifest = '<manifest package="com.touchcatch.mobile" INTERNET VIBRATE/>';
const cleanJs = 'var API="https://api.touchcatch.example";var x=1;';

function shippableBundle(overrides: Partial<Record<string, string>> = {}) {
  return [
    ['META-INF/UPLOAD.SF', 'Signature-Version: 1.0'],
    ['META-INF/UPLOAD.RSA', 'CN=TouchCatch Upload Key'],
    ['base/manifest/AndroidManifest.xml', overrides.manifest ?? cleanManifest],
    ['base/assets/index.android.bundle', overrides.js ?? cleanJs],
    ['base/lib/arm64-v8a/libreactnative.so', 'ELF'],
    ['base/lib/armeabi-v7a/libreactnative.so', 'ELF'],
  ] as ReadonlyArray<readonly [string, string]>;
}

describe('release aab inspector', () => {
  it('passes a bundle with nothing wrong with it', () => {
    const report = inspect(writeZip('clean.aab', shippableBundle()));
    expect(report.failures).toEqual([]);
    expect(report.verdict).toBe('PASS');
    expect(report.abis).toEqual(['arm64-v8a', 'armeabi-v7a']);
    expect(report.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rejects an unsigned bundle', () => {
    const entries = shippableBundle().filter(([name]) => !name.startsWith('META-INF/'));
    const report = inspect(writeZip('unsigned.aab', entries));
    expect(report.failures).toContain('bundle carries no META-INF signature block: it is unsigned');
  });

  it('rejects the debug certificate', () => {
    const entries = shippableBundle().map(([name, content]) =>
      name === 'META-INF/UPLOAD.RSA' ? ([name, 'CN=Android Debug, O=Android'] as const) : ([name, content] as const),
    );
    const report = inspect(writeZip('debugsigned.aab', entries));
    expect(report.failures.join('\n')).toContain('Android debug certificate');
  });

  it('rejects storage and overlay permissions that survived the merge', () => {
    const report = inspect(
      writeZip('perms.aab', shippableBundle({
        manifest: `${cleanManifest}<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>`,
      })),
    );
    expect(report.failures.join('\n')).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });

  it('rejects a bundle that carries the private solution fields', () => {
    const report = inspect(
      writeZip('leak.aab', shippableBundle({
        js: `${cleanJs}var r={canonicalAnswer:"a",privateSolutionHash:"b",hintUnits:[]};`,
      })),
    );
    expect(report.failures.join('\n')).toContain('private content fields');
  });

  it('does not cry leak over one field name that is also an ordinary UI word', () => {
    const report = inspect(
      writeZip('title-only.aab', shippableBundle({ js: `${cleanJs}var header={title:"설정"};` })),
    );
    expect(report.failures).toEqual([]);
  });

  it('rejects a loopback origin the app configured', () => {
    const report = inspect(
      writeZip('loopback.aab', shippableBundle({ js: 'var API="http://10.0.2.2:18787";' })),
    );
    expect(report.failures.join('\n')).toContain('10.0.2.2');
  });

  it('tolerates the loopback URLs react-native bakes into every bundle', () => {
    const report = inspect(
      writeZip('framework.aab', shippableBundle({
        js: `${cleanJs}var a="http://localhost:8081/assets";var b="http://localhost:9999";`,
      })),
    );
    expect(report.failures).toEqual([]);
  });

  it('requires a declared production origin to actually be present', () => {
    const file = writeZip('missing-origin.aab', shippableBundle());
    const report = inspect(file, ['--expect-origin', 'https://api.touchcatch.app']);
    expect(report.failures.join('\n')).toContain('does not contain the declared production origin');

    const ok = inspect(file, ['--expect-origin', 'https://api.touchcatch.example']);
    expect(ok.failures).toEqual([]);
  });

  it('rejects a bundle built with __DEV__ on', () => {
    const report = inspect(
      writeZip('dev.aab', shippableBundle({ js: 'var __DEV__ = true;' })),
    );
    expect(report.failures.join('\n')).toContain('__DEV__');
  });
});
