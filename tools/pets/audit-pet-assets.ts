import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type PetRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type CoachArchetype = 'SCOUT' | 'LINGUIST' | 'SAGE' | 'CHEER';

export type PetArtAdmissionV1 = Readonly<{
  sourceSha256: string;
  normalizedSlug: string;
  candidateRarity: PetRarity;
  familySlug: string | null;
  rightsStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  provenanceNote: string;
  visualReview: 'PENDING' | 'APPROVED' | 'REDRAW_REQUIRED' | 'REJECTED';
  backgroundReview: 'PENDING' | 'APPROVED' | 'REMOVE_REQUIRED';
  cropReview: 'PENDING' | 'APPROVED' | 'REWORK_REQUIRED';
  coachArchetype: CoachArchetype;
}>;

type Candidate = { fileName: string; bytes: Uint8Array; rarity: PetRarity };
type Roots = {
  commonRoot: string;
  rareRoot: string;
  legendaryRoot: string;
  readEntries?: () => Promise<Candidate[]>;
};

export type PetSourceManifestV1 = Readonly<{
  schemaVersion: 1;
  admissions: ReadonlyArray<PetArtAdmissionV1 & Readonly<{
    fileName: string;
    width: number;
    height: number;
    pixelFormat: string;
  }>>;
}>;

type PngMetadata = { width: number; height: number; pixelFormat: string };

const rarityRoots: ReadonlyArray<readonly [PetRarity, keyof Pick<Roots, 'commonRoot' | 'rareRoot' | 'legendaryRoot'>]> = [
  ['COMMON', 'commonRoot'], ['RARE', 'rareRoot'], ['LEGENDARY', 'legendaryRoot'],
];

export function normalizePetSlug(fileName: string, options: { stripRarePrefix?: boolean } = {}): string {
  const stem = basename(fileName, extname(fileName)).trim().toLowerCase();
  const withoutPrefix = options.stripRarePrefix ? stem.replace(/^rare\s*-\s*/, '') : stem;
  return withoutPrefix.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function pngMetadata(bytes: Uint8Array): PngMetadata {
  if (bytes.length < 33 || Buffer.compare(Buffer.from(bytes.subarray(0, 8)), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0 || Buffer.from(bytes.subarray(12, 16)).toString('ascii') !== 'IHDR') {
    throw new TypeError('invalid PNG');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const colorType = bytes[25];
  const pixelFormat = ({ 0: 'GRAY', 2: 'RGB', 3: 'INDEXED', 4: 'GRAYA', 6: 'RGBA' } as Record<number, string>)[colorType ?? -1];
  if (!width || !height || !pixelFormat) throw new TypeError('invalid PNG metadata');
  return { width, height, pixelFormat };
}

async function diskEntries(roots: Roots): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  for (const [rarity, rootName] of rarityRoots) {
    const root = roots[rootName];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isFile()) candidates.push({ fileName: entry.name, bytes: await readFile(join(root, entry.name)), rarity });
    }
  }
  return candidates;
}

function coachArchetype(slug: string): CoachArchetype {
  if (/(parrot|chameleon|fairy)/.test(slug)) return 'LINGUIST';
  if (/(elephant|turtle|unicorn|phoenix)/.test(slug)) return 'SAGE';
  if (/(dog|bichon|chihuahua|maltese|pomeranian|poodle|retriever|corgi|terrier)/.test(slug)) return 'CHEER';
  return 'SCOUT';
}

export async function auditPetAssets(roots: Roots): Promise<{
  summary: { commonCandidates: number; rareCandidates: number; legendaryCandidates: number; dimensions: Array<{ width: number; height: number }>; commonRarePairs: Array<{ familySlug: string; commonSha256: string; rareSha256: string }>; rejected: Array<{ fileName: string; reason: string }> };
  manifest: PetSourceManifestV1;
  catalog: { entries: Array<{ normalizedSlug: string; candidateRarity: PetRarity; sourceSha256: string }> };
}> {
  const rejected: Array<{ fileName: string; reason: string }> = [];
  const candidates = roots.readEntries ? await roots.readEntries() : await diskEntries(roots);
  const entries: Array<PetArtAdmissionV1 & { fileName: string; width: number; height: number; pixelFormat: string }> = [];
  const seen = new Set<string>();
  const counts: Record<PetRarity, number> = { COMMON: 0, UNCOMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };

  for (const candidate of candidates) {
    if (extname(candidate.fileName).toLowerCase() !== '.png') {
      rejected.push({ fileName: candidate.fileName, reason: 'UNSUPPORTED_FILE_TYPE' });
      continue;
    }
    const normalizedSlug = normalizePetSlug(candidate.fileName, { stripRarePrefix: candidate.rarity === 'RARE' });
    const uniquenessKey = `${candidate.rarity}:${normalizedSlug}`;
    if (!normalizedSlug || seen.has(uniquenessKey)) throw new TypeError(`duplicate normalized slug: ${normalizedSlug}`);
    seen.add(uniquenessKey);
    const metadata = pngMetadata(candidate.bytes);
    counts[candidate.rarity] += 1;
    entries.push({
      sourceSha256: sha256(candidate.bytes),
      normalizedSlug,
      candidateRarity: candidate.rarity,
      familySlug: candidate.rarity === 'LEGENDARY' ? null : normalizedSlug,
      rightsStatus: 'PENDING',
      provenanceNote: 'Desktop candidate; rights decision required before admission.',
      visualReview: candidate.rarity === 'LEGENDARY' && normalizedSlug === 'dragon' ? 'REDRAW_REQUIRED' : 'PENDING',
      backgroundReview: 'PENDING',
      cropReview: 'PENDING',
      coachArchetype: coachArchetype(normalizedSlug),
      fileName: candidate.fileName,
      ...metadata,
    });
  }

  entries.sort((left, right) => left.candidateRarity.localeCompare(right.candidateRarity) || left.normalizedSlug.localeCompare(right.normalizedSlug) || left.sourceSha256.localeCompare(right.sourceSha256));
  const common = new Map(entries.filter((entry) => entry.candidateRarity === 'COMMON').map((entry) => [entry.familySlug!, entry]));
  const rare = new Map(entries.filter((entry) => entry.candidateRarity === 'RARE').map((entry) => [entry.familySlug!, entry]));
  const commonRarePairs = [...common.keys()].filter((familySlug) => rare.has(familySlug)).sort().map((familySlug) => ({ familySlug, commonSha256: common.get(familySlug)!.sourceSha256, rareSha256: rare.get(familySlug)!.sourceSha256 }));
  const dimensions = [...new Map(entries.map(({ width, height }) => [`${width}x${height}`, { width, height }])).values()];

  return {
    summary: { commonCandidates: counts.COMMON, rareCandidates: counts.RARE, legendaryCandidates: counts.LEGENDARY, dimensions, commonRarePairs, rejected },
    manifest: { schemaVersion: 1, admissions: entries },
    catalog: { entries: entries.map(({ normalizedSlug, candidateRarity, sourceSha256 }) => ({ normalizedSlug, candidateRarity, sourceSha256 })) },
  };
}

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new TypeError(`${name} requires a value`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await auditPetAssets({ commonRoot: option('--common-root'), rareRoot: option('--rare-root'), legendaryRoot: option('--legendary-root') });
  const output = option('--out');
  await writeFile(output, `${JSON.stringify(result.manifest, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result.summary));
}
