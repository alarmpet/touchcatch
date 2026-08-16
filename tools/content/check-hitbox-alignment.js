import console from 'node:console';
import fs from 'node:fs/promises';
import process from 'node:process';
import { decodeGreyPng } from './png-grey.js';

/**
 * Measures whether a pack's recorded difference hitboxes sit on the artwork's actual
 * differences.
 *
 * A spot-the-difference board is unplayable if they do not: the player taps a real change
 * and is told they missed, while the recorded spot looks identical in both pictures. That
 * failure is invisible to every other check in the repo, because the draft is internally
 * consistent — its hashes verify, its schema validates, and its coordinates are simply
 * pointing at the wrong place.
 *
 * The bar is scale-free on purpose. Comparing a patch to the image-wide average punishes
 * pairs that differ broadly, so instead each hitbox is ranked against random patches of
 * the same size from the same pair: a genuine difference should be busier than most of the
 * picture.
 *
 * This is a diagnostic, not a gate. A hitbox can be slightly offset and still be playable,
 * because hit testing uses a generous radius. Treat a low score as "look at this pack",
 * not as proof the pack is broken — the two packs held out in the preview generator were
 * each confirmed by eye first.
 */

const SAMPLE_COUNT = 400;
const PERCENTILE = 90;

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function patchMean(diff, size, cx, cy, radius) {
  const x0 = Math.max(0, Math.round(cx - radius));
  const y0 = Math.max(0, Math.round(cy - radius));
  const x1 = Math.min(size, Math.round(cx + radius));
  const y1 = Math.min(size, Math.round(cy + radius));
  let total = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) { total += diff[y * size + x]; count += 1; }
  }
  return count === 0 ? 0 : total / count;
}

/** Box-average downscale in colour. Averaging matters: nearest-neighbour on a detailed
 *  scene aliases badly and invents differences that are not there. */
function downscaleRgb(image, size) {
  const out = new Float64Array(size * size * 3);
  const stepY = image.height / size;
  const stepX = image.width / size;
  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * stepY), y1 = Math.max(y0 + 1, Math.floor((y + 1) * stepY));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * stepX), x1 = Math.max(x0 + 1, Math.floor((x + 1) * stepX));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * image.width + sx) * 3;
          r += image.rgb[i]; g += image.rgb[i + 1]; b += image.rgb[i + 2]; n += 1;
        }
      }
      const o = (y * size + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

export async function checkHitboxAlignment({
  manifestPath = 'content/learning/manifest.v1.json',
  draftsRoot = 'content/learning/drafts',
  sourceRoot = 'content/learning/source',
  size = 256,
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const results = [];
  for (const entry of manifest.entries) {
    let a, b;
    try {
      a = decodeGreyPng(await fs.readFile(`${sourceRoot}/${entry.key}-a.png`));
      b = decodeGreyPng(await fs.readFile(`${sourceRoot}/${entry.key}-b.png`));
    } catch { continue; }
    if (a === null || b === null) continue;

    const ca = downscaleRgb(a, size);
    const cb = downscaleRgb(b, size);
    const diff = new Float64Array(size * size);
    for (let i = 0; i < diff.length; i += 1) {
      const o = i * 3;
      diff[i] = Math.abs(ca[o] - cb[o]) + Math.abs(ca[o + 1] - cb[o + 1]) + Math.abs(ca[o + 2] - cb[o + 2]);
    }

    const draft = JSON.parse(await fs.readFile(`${draftsRoot}/${entry.key}.json`, 'utf8'));
    const boxes = draft.privateSolution.differences.map((d) => d.hitboxes.imageA);
    if (boxes.length === 0) continue;
    const radius = boxes[0].r * size;

    const random = mulberry32(7);
    const samples = [];
    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const cx = radius + random() * (size - 2 * radius);
      const cy = radius + random() * (size - 2 * radius);
      samples.push(patchMean(diff, size, cx, cy, radius));
    }
    samples.sort((x, y) => x - y);
    const bar = samples[Math.floor((samples.length - 1) * (PERCENTILE / 100))];

    const aligned = boxes.filter((box) =>
      patchMean(diff, size, box.cx * size, box.cy * size, radius) > bar).length;
    results.push({ key: entry.key, aligned, total: boxes.length, ratio: aligned / boxes.length });
  }
  results.sort((left, right) => left.ratio - right.ratio);
  return results;
}

if (process.argv[1]?.endsWith('check-hitbox-alignment.js')) {
  const results = await checkHitboxAlignment();
  for (const { key, aligned, total, ratio } of results) {
    if (ratio < 0.8) console.log(`[HITBOX] ${(ratio * 100).toFixed(0).padStart(3)}%  ${aligned}/${total}  ${key}`);
  }
  console.log(`[HITBOX ALIGNMENT] ${results.filter((r) => r.ratio < 0.3).length} pack(s) below 30%, ${results.length} scanned`);
}
