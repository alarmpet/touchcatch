import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

function assertNoLoneSurrogates(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('canonical JSON rejects lone surrogates');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('canonical JSON rejects lone surrogates');
    }
  }
}

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertNoLoneSurrogates(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonical JSON accepts plain objects only');
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        assertNoLoneSurrogates(key);
        if (value[key] === undefined) throw new TypeError('canonical JSON rejects undefined');
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      })
      .join(',')}}`;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

export function canonicalJsonSha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const sha = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const uuid = (value) => {
  const h = createHash('sha256').update(value).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

async function descriptor(file) {
  const [hash, info, meta] = await Promise.all([sha(file), stat(file), sharp(file).metadata()]);
  if (!meta.width || !meta.height || meta.format !== 'png') throw Error('LEARNING_ASSET_MUST_BE_PNG');
  return { url: `https://cdn.spot-learn.test/assets/${hash}.png`, sha256: hash, encodedBytes: info.size, width: meta.width, height: meta.height, mimeType: 'image/png' };
}

export async function writeLearningBundle(entry, imageA, imageB, output, geometry = {}) {
  const [a, b] = await Promise.all([descriptor(imageA), descriptor(imageB)]);
  if (a.width !== b.width || a.height !== b.height) throw Error('PAIR_DIMENSION_MISMATCH');
  const revision = uuid(`${entry.key}:${a.sha256}:${b.sha256}`);
  const body = {
    contentRevisionId: revision,
    schemaVersion: '1.0.0',
    differences: (geometry.differences ?? []).map(x => ({ objectiveId: x.id, tier: x.tier, hitboxes: { imageA: { cx: x.cx, cy: x.cy, r: x.r }, imageB: { cx: x.cx, cy: x.cy, r: x.r } } })),
    wordHunts: (geometry.wordHunts ?? []).map(x => ({ missionId: x.id, kind: x.kind, publicPrompt: x.publicPrompt, hitboxes: { imageA: { cx: x.cx, cy: x.cy, r: x.r }, imageB: { cx: x.cx, cy: x.cy, r: x.r } } })),
    suddenDeath: geometry.suddenDeath ? { objectiveId: geometry.suddenDeath.id, hitboxes: { imageA: { cx: geometry.suddenDeath.cx, cy: geometry.suddenDeath.cy, r: geometry.suddenDeath.r }, imageB: { cx: geometry.suddenDeath.cx, cy: geometry.suddenDeath.cy, r: geometry.suddenDeath.r } } } : null,
    finalChallenge: { canonicalAnswer: entry.canonicalAnswer, aliases: entry.aliases, hintUnits: [...new Intl.Segmenter(entry.language, { granularity: 'grapheme' }).segment(entry.canonicalAnswer)].map(x => x.segment), meaning: entry.meaning }
  };
  const result = {
    schemaVersion: '1.0.0',
    status: 'DRAFT',
    rightsReviewStatus: 'REVIEW_REQUIRED',
    educationReviewStatus: 'REVIEW_REQUIRED',
    publicContent: { contentId: uuid(entry.key), version: 1, contentRevisionId: revision, schemaVersion: '1.0.0', assetPolicyVersion: '1.0.0', theme: entry.key, language: entry.language, difficulty: entry.difficulty ?? 'ADVANCED', imageA: a, imageB: b },
    privateSolution: { ...body, privateSolutionHash: canonicalJsonSha256(body) },
    assetFiles: { [a.sha256]: imageA, [b.sha256]: imageB }
  };
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return result;
}
