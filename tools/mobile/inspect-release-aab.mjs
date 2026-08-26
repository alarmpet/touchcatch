import console from 'node:console';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { inflateRawSync } from 'node:zlib';

/**
 * Reads the release bundle that will actually be uploaded and refuses the ones that must not be.
 *
 * Every gate before this one reads source. Source is not what ships: the bundler decides what
 * ends up in the JavaScript, the manifest merger decides which permissions survive, and the
 * signing config decides whose key is on it. A repository can be entirely green and still emit a
 * bundle carrying the answer keys, pointing at `10.0.2.2`, or signed with the debug certificate.
 *
 * So this opens the .aab -- it is a zip -- and looks.
 *
 * Deliberately dependency-free, including the zip reader. This runs on the artifact that becomes
 * the shipped binary; adding a package here widens the trust boundary at precisely the point the
 * check exists to narrow it.
 *
 *   node tools/mobile/inspect-release-aab.mjs --aab <path> [--json]
 */

const args = process.argv.slice(2);
function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

const aabPath = flag('--aab');
if (!aabPath) {
  console.error(
    'usage: node tools/mobile/inspect-release-aab.mjs --aab <path> [--expect-origin <url>]... [--json]',
  );
  process.exit(2);
}

/**
 * Absence of a loopback URL is not presence of the right one: a bundle built with the env vars
 * simply unset carries neither, and passes a ban-list check while reaching nothing. Each
 * --expect-origin must actually appear.
 */
const expectedOrigins = args.flatMap((value, index) =>
  args[index - 1] === '--expect-origin' ? [value] : [],
);

// --- minimal zip reader ------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** Central-directory walk. Enough to list entries and inflate the ones we read. */
function readZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 0xffff; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const read = (entry) => {
    const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const start = entry.localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateRawSync(raw);
    throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
  };

  return { entries, read };
}

// --- checks ------------------------------------------------------------------------------

/**
 * Field names alone produce false positives -- `title` is an ordinary UI word. The registry is
 * recognisable by the combination that only the private content bundle has.
 */
const privateContentMarkers = [
  'privateSolutionHash',
  'canonicalAnswer',
  'correctOptionId',
  'hintUnits',
];

/**
 * React Native and Expo bake two loopback URLs into every release bundle regardless of
 * configuration: the asset registry's dev-server default and the blob collector's port. They are
 * framework string constants, not something this app configured, and a check that fails on them
 * fails on every build that could ever be made -- which is the same as no check at all.
 *
 * Everything else that resolves to this machine is ours, and is a bundle that cannot reach a
 * server once it leaves this machine.
 */
const frameworkLoopbackConstants = ['http://localhost:8081/assets', 'http://localhost:9999'];

const forbiddenOrigins = [
  /https?:\/\/10\.0\.2\.2(?::\d+)?/gu,
  /https?:\/\/127\.0\.0\.1(?::\d+)?/gu,
  /https?:\/\/localhost(?::\d+)?/gu,
  /https?:\/\/0\.0\.0\.0(?::\d+)?/gu,
  /example\.invalid/gu,
];

const forbiddenPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

const buffer = await fs.readFile(aabPath);
const zip = readZip(buffer);
const failures = [];
const notes = [];

const sha256 = createHash('sha256').update(buffer).digest('hex');

// 1. Signed at all. An unsigned bundle is rejected by Play, but silently by us until now.
const signatureEntries = zip.entries.filter((entry) =>
  /^META-INF\/.*\.(RSA|DSA|EC|SF)$/iu.test(entry.name),
);
if (signatureEntries.length === 0) {
  failures.push('bundle carries no META-INF signature block: it is unsigned');
}

// 2. The debug keystore's certificate must not be the one on a release bundle. The tracked
//    debug key has a fixed, well-known subject; anything signed with it is not shippable.
for (const entry of signatureEntries.filter((e) => /\.(RSA|DSA|EC)$/iu.test(e.name))) {
  const der = zip.read(entry);
  const text = der.toString('latin1');
  if (text.includes('Android Debug')) {
    failures.push(`signed with the Android debug certificate (${entry.name})`);
  }
  if (text.includes('DoNotShip') || text.includes('Throwaway')) {
    failures.push(`signed with a throwaway build-verification certificate (${entry.name})`);
  }
}

// 3. The merged manifest is protobuf inside the bundle, but permission names survive as
//    readable strings, which is all this needs to assert.
const manifestEntry = zip.entries.find((entry) => entry.name === 'base/manifest/AndroidManifest.xml');
if (!manifestEntry) {
  failures.push('no base/manifest/AndroidManifest.xml in the bundle');
} else {
  const manifest = zip.read(manifestEntry).toString('latin1');
  for (const permission of forbiddenPermissions) {
    if (manifest.includes(permission)) {
      failures.push(`merged manifest still requests ${permission}`);
    }
  }
  if (!manifest.includes('com.touchcatch.mobile')) {
    failures.push('merged manifest does not name com.touchcatch.mobile');
  }
  notes.push(`manifest entry ${manifestEntry.uncompressedSize} bytes`);
}

// 4. The JavaScript bundle: answer keys and non-production origins.
const jsEntries = zip.entries.filter((entry) => /\.(bundle|js|hbc)$/u.test(entry.name));
if (jsEntries.length === 0) {
  failures.push('no JavaScript bundle found in the artifact');
}
for (const entry of jsEntries) {
  const source = zip.read(entry).toString('utf8');
  const markers = privateContentMarkers.filter((marker) => source.includes(marker));
  // Two or more is the registry shape; one alone is a coincidence not worth a false alarm.
  if (markers.length >= 2) {
    failures.push(`${entry.name} contains private content fields: ${markers.join(', ')}`);
  }
  let searchable = source;
  for (const constant of frameworkLoopbackConstants) searchable = searchable.replaceAll(constant, '');
  for (const pattern of forbiddenOrigins) {
    const found = [...new Set(searchable.match(pattern) ?? [])];
    if (found.length > 0) {
      failures.push(`${entry.name} points at a non-production origin: ${found.join(', ')}`);
    }
  }
  for (const origin of expectedOrigins) {
    if (!source.includes(origin)) {
      failures.push(`${entry.name} does not contain the declared production origin ${origin}`);
    }
  }
  if (/__DEV__\s*=\s*true/u.test(source)) {
    failures.push(`${entry.name} was built with __DEV__ = true`);
  }
  notes.push(`${entry.name} ${entry.uncompressedSize} bytes`);
}

const abis = [
  ...new Set(
    zip.entries
      .map((entry) => /^base\/lib\/([^/]+)\//u.exec(entry.name)?.[1])
      .filter((abi) => abi !== undefined),
  ),
].sort();

const report = {
  artifact: path.resolve(aabPath),
  sha256,
  sizeBytes: buffer.length,
  entryCount: zip.entries.length,
  abis,
  signatureEntries: signatureEntries.map((entry) => entry.name),
  notes,
  failures,
  verdict: failures.length === 0 ? 'PASS' : 'FAIL',
};

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`aab      ${report.artifact}`);
  console.log(`sha256   ${sha256}`);
  console.log(`size     ${(buffer.length / 1024 / 1024).toFixed(2)} MB, ${zip.entries.length} entries`);
  console.log(`abis     ${abis.join(', ') || '(none)'}`);
  console.log(`signed   ${signatureEntries.map((e) => e.name).join(', ') || '(NOT SIGNED)'}`);
  for (const note of notes) console.log(`         ${note}`);
  if (failures.length > 0) {
    console.error('');
    for (const failure of failures) console.error(`FAIL     ${failure}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
