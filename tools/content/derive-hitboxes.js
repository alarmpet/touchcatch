import console from 'node:console';
import fs from 'node:fs/promises';
import process from 'node:process';
import { decodeGreyPng } from './png-grey.js';
import { hasGuideGrid } from './check-art-grid.js';

/**
 * Derives difference hitboxes from the artwork instead of trusting the recorded ones.
 *
 * The drafts' coordinates do not reliably sit on the pictures' actual differences — on
 * some packs only one of ten does — which makes those boards unplayable: a tap on a real
 * change is rejected, and the recorded spot looks identical in both images. The three
 * hand-authored preview packs sidestepped this by placing coordinates by eye.
 *
 * Measuring is the same job done repeatably. Where the two pictures differ *is* the set of
 * differences, so this diffs the pair, clusters the changed pixels, and emits one hitbox
 * per cluster. A pack is rejected outright when the pair cannot support the game — too few
 * distinct changes to play, or so much of the frame changed that there is no discrete
 * difference to find.
 *
 * The admitted drafts are hash-pinned and are never touched. Output is a cache committed
 * alongside the content so registry generation stays fast and deterministic; image
 * analysis of 150-odd 1024px PNGs is far too slow to run inside a test.
 */

/** Analysis resolution. Coarse on purpose: it suppresses compression and texture noise. */
const GRID = 256;
/** Per-pixel colour distance (sum over RGB) that counts as changed. */
const CHANGE_THRESHOLD = 70;
/** Clusters smaller than this are texture noise, not an authored difference. */
const MIN_AREA = 24;
/** A single change covering this much of the frame is a redraw, not a spot-the-difference. */
const MAX_REGION_FRACTION = 0.06;
/** Above this much total change the two images are simply different pictures. */
const MAX_TOTAL_CHANGE = 0.18;
/** Fewer distinct differences than this is not a board worth serving. */
const MIN_DIFFERENCES = 5;
/** Cap so a large object does not become a hitbox the player cannot miss. */
const MAX_RADIUS = 0.11;
/** WCAG 2.5.8: 44pt on a ~390pt board is ~0.056 normalised, so never go below it. */
const MIN_RADIUS = 0.06;
/** Share of the tap neighbourhood that must actually have changed. */
const MIN_DENSITY = 0.35;

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

/** Grow then shrink, so a change broken up by texture reads as one object. */
function close(mask, size, radius) {
  const dilate = (input, grow) => {
    const out = new Uint8Array(input.length);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let hit = 0;
        for (let dy = -radius; dy <= radius && !hit; dy += 1) {
          for (let dx = -radius; dx <= radius && !hit; dx += 1) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue;
            if (input[ny * size + nx] === (grow ? 1 : 0)) hit = 1;
          }
        }
        out[y * size + x] = grow ? hit : (hit ? 0 : 1);
      }
    }
    return out;
  };
  return dilate(dilate(mask, true), false);
}

/**
 * The point inside a cluster with the most change packed around it.
 *
 * Neither the bounding-box centre nor the centroid is safe: a ring, a crescent or a
 * scattered cluster puts both in a hole where the two pictures are identical, so a player
 * tapping the thing they can see is rejected. The densest point is on the change by
 * construction, which is the property the hit test needs.
 */
function densestPoint(members, mask, size, radius) {
  let best = members[0], bestScore = -1;
  const window = (2 * radius + 1) ** 2;
  for (const index of members) {
    const y = Math.floor(index / size), x = index % size;
    let score = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= size) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= size) continue;
        score += mask[ny * size + nx];
      }
    }
    if (score > bestScore) { bestScore = score; best = index; }
  }
  return { x: best % size, y: Math.floor(best / size), density: bestScore / window };
}

function clusters(mask, size) {
  const seen = new Uint8Array(mask.length);
  const found = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    let head = 0, tail = 0;
    queue[tail += 1] = start; seen[start] = 1;
    let minX = size, maxX = -1, minY = size, maxY = -1, area = 0, sumX = 0, sumY = 0;
    const members = [];
    while (head < tail) {
      const index = queue[head += 1];
      const y = Math.floor(index / size), x = index % size;
      area += 1; sumX += x; sumY += y; members.push(index);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + dy, nx = x + dx;
        if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue;
        const next = ny * size + nx;
        if (mask[next] === 1 && seen[next] === 0) { seen[next] = 1; queue[tail += 1] = next; }
      }
    }
    found.push({ area, minX, maxX, minY, maxY, sumX, sumY, members });
  }
  return found;
}

export async function deriveHitboxes({
  manifestPath = 'content/learning/manifest.v1.json',
  sourceRoot = 'content/learning/source',
  outputPath = 'content/learning/derived-hitboxes.v1.json',
  write = true,
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const packs = {};
  for (const entry of manifest.entries) {
    let a, b;
    try {
      a = decodeGreyPng(await fs.readFile(`${sourceRoot}/${entry.key}-a.png`));
      b = decodeGreyPng(await fs.readFile(`${sourceRoot}/${entry.key}-b.png`));
    } catch {
      packs[entry.key] = { usable: false, reason: 'ARTWORK_UNREADABLE', differences: [] };
      continue;
    }
    if (a === null || b === null) {
      packs[entry.key] = { usable: false, reason: 'ARTWORK_UNREADABLE', differences: [] };
      continue;
    }

    const ca = downscaleRgb(a, GRID);
    const cb = downscaleRgb(b, GRID);
    const mask = new Uint8Array(GRID * GRID);
    for (let i = 0; i < mask.length; i += 1) {
      const o = i * 3;
      const distance = Math.abs(ca[o] - cb[o]) + Math.abs(ca[o + 1] - cb[o + 1]) + Math.abs(ca[o + 2] - cb[o + 2]);
      mask[i] = distance > CHANGE_THRESHOLD ? 1 : 0;
    }
    const totalChange = mask.reduce((sum, value) => sum + value, 0) / mask.length;

    const regions = clusters(close(mask, GRID, 2), GRID)
      .filter((region) => region.area >= MIN_AREA)
      .sort((left, right) => right.area - left.area);

    const oversized = regions.filter((region) =>
      ((region.maxX - region.minX + 1) * (region.maxY - region.minY + 1)) / mask.length > MAX_REGION_FRACTION);

    const differences = regions
      .filter((region) => !oversized.includes(region))
      .map((region) => ({
        region,
        point: densestPoint(region.members, mask, GRID, 4),
        half: Math.max(region.maxX - region.minX, region.maxY - region.minY) / 2 / GRID,
      }))
      // A diffuse cluster — a lighting or texture shift spread thin — has no point a
      // player could aim at. Keeping it would mean an objective nobody can claim.
      .filter(({ point }) => point.density >= MIN_DENSITY)
      .map(({ point, half }, index) => ({
        id: `derived-${index + 1}`,
        cx: Number((point.x / GRID).toFixed(4)),
        cy: Number((point.y / GRID).toFixed(4)),
        r: Number(Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, half * 1.15)).toFixed(4)),
      }));

    let reason = null;
    if (totalChange > MAX_TOTAL_CHANGE) reason = 'IMAGES_DIFFER_GLOBALLY';
    else if (differences.length < MIN_DIFFERENCES) reason = 'TOO_FEW_DIFFERENCES';
    // A composition guide baked into the frame is invisible to the difference map: the pair
    // can diff perfectly well and still be unplayable, because the grid usually lands in only
    // one of the two images and every line then reads as a difference nobody can claim.
    else if (hasGuideGrid(a) || hasGuideGrid(b)) reason = 'BAKED_GUIDE_GRID';

    packs[entry.key] = {
      usable: reason === null,
      ...(reason === null ? {} : { reason }),
      totalChange: Number(totalChange.toFixed(4)),
      differences,
    };
  }

  const payload = {
    schemaVersion: '1',
    note: 'Generated by tools/content/derive-hitboxes.js from the source artwork. Do not edit by hand.',
    grid: GRID,
    packs,
  };
  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (write) await fs.writeFile(outputPath, json, 'utf8');
  return { payload, json };
}

if (process.argv[1]?.endsWith('derive-hitboxes.js')) {
  const { payload } = await deriveHitboxes();
  const all = Object.entries(payload.packs);
  const usable = all.filter(([, pack]) => pack.usable);
  const counts = {};
  for (const [, pack] of all.filter(([, p]) => !p.usable)) counts[pack.reason] = (counts[pack.reason] ?? 0) + 1;
  console.log(`[HITBOXES DERIVED] ${usable.length}/${all.length} packs usable`);
  for (const [reason, count] of Object.entries(counts)) console.log(`  rejected ${reason}: ${count}`);
  const sizes = usable.map(([, pack]) => pack.differences.length).sort((x, y) => x - y);
  if (sizes.length > 0) {
    console.log(`  differences per pack: min=${sizes[0]} median=${sizes[Math.floor(sizes.length / 2)]} max=${sizes.at(-1)}`);
  }
}
