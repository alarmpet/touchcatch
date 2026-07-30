import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { PetSourceManifestV1 } from './audit-pet-assets.js';

type Admission = PetSourceManifestV1['admissions'][number];
type Derivative = Readonly<{
  sourceSha256: string;
  kind: 'CARD' | 'PORTRAIT';
  fileName: string;
  sha256: string;
  width: number;
  height: number;
  safeCrop: { x: number; y: number; width: number; height: number };
}>;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isApproved(admission: Admission): boolean {
  return admission.rightsStatus === 'APPROVED'
    && admission.visualReview === 'APPROVED'
    && admission.backgroundReview === 'APPROVED'
    && admission.cropReview === 'APPROVED';
}

async function sourceFor(admission: Admission, sourceRoots: readonly string[]): Promise<string> {
  for (const root of sourceRoots) {
    const exact = join(root, admission.fileName);
    const bytes = await readFile(exact).catch(() => undefined);
    if (bytes && sha256(bytes) === admission.sourceSha256) return exact;
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isFile()) continue;
      const path = join(root, entry.name);
      const candidate = await readFile(path);
      if (sha256(candidate) === admission.sourceSha256) return path;
    }
  }
  throw new TypeError(`approved source not found for ${admission.sourceSha256}`);
}

async function derivative(source: Uint8Array, sourceSha256: string, kind: Derivative['kind'], mobileDirectory: string): Promise<Derivative> {
  const sourceInfo = await sharp(source).metadata();
  if (!sourceInfo.width || !sourceInfo.height) throw new TypeError(`invalid source image ${sourceSha256}`);
  const maximum = kind === 'CARD' ? { width: 512, height: 768 } : { width: 384, height: 576 };
  const bytes = await sharp(source)
    .resize({ ...maximum, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height || metadata.width > sourceInfo.width || metadata.height > sourceInfo.height) throw new TypeError(`derivative upscaled ${sourceSha256}`);
  const fileName = `${sourceSha256}.${kind.toLowerCase()}.png`;
  await writeFile(join(mobileDirectory, fileName), bytes);
  return { sourceSha256, kind, fileName, sha256: sha256(bytes), width: metadata.width, height: metadata.height, safeCrop: { x: 0, y: 0, width: sourceInfo.width, height: sourceInfo.height } };
}

export async function buildPetAssets(options: {
  admissions: readonly Admission[];
  sourceRoots: readonly string[];
  sourceDirectory: string;
  mobileDirectory: string;
}): Promise<{ derivatives: Derivative[] }> {
  await mkdir(options.sourceDirectory, { recursive: true });
  await mkdir(options.mobileDirectory, { recursive: true });
  const derivatives: Derivative[] = [];
  const approvedAdmissions = [...options.admissions].filter(isApproved).sort((left, right) => left.sourceSha256.localeCompare(right.sourceSha256));
  for (const admission of approvedAdmissions) {
    const sourcePath = await sourceFor(admission, options.sourceRoots);
    const target = join(options.sourceDirectory, `${admission.sourceSha256}.png`);
    await cp(sourcePath, target, { force: true });
    const bytes = await readFile(target);
    if (sha256(bytes) !== admission.sourceSha256) throw new TypeError(`source hash mismatch for ${admission.sourceSha256}`);
    derivatives.push(await derivative(bytes, admission.sourceSha256, 'CARD', options.mobileDirectory));
    derivatives.push(await derivative(bytes, admission.sourceSha256, 'PORTRAIT', options.mobileDirectory));
  }
  const approvedHashes = new Set(approvedAdmissions.map((admission) => admission.sourceSha256));
  for (const entry of await readdir(options.sourceDirectory, { withFileTypes: true })) {
    if (entry.isFile() && /^[0-9a-f]{64}\.png$/.test(entry.name) && !approvedHashes.has(entry.name.slice(0, 64))) await unlink(join(options.sourceDirectory, entry.name));
  }
  for (const entry of await readdir(options.mobileDirectory, { withFileTypes: true })) {
    const match = /^([0-9a-f]{64})\.(card|portrait)\.png$/.exec(entry.name);
    if (entry.isFile() && match && !approvedHashes.has(match[1]!)) await unlink(join(options.mobileDirectory, entry.name));
  }
  return { derivatives };
}

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const manifest = JSON.parse(await readFile(option('--manifest'), 'utf8')) as PetSourceManifestV1;
  const sourceRoots = process.argv.flatMap((value, index) => value === '--source-root' ? [process.argv[index + 1] ?? ''] : []).filter(Boolean);
  if (sourceRoots.length === 0) throw new TypeError('--source-root requires at least one value');
  const result = await buildPetAssets({ admissions: manifest.admissions, sourceRoots, sourceDirectory: option('--source-directory'), mobileDirectory: option('--mobile-directory') });
  console.log(JSON.stringify(result));
}
