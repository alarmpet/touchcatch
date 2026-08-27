import console from 'node:console';
import fs from 'node:fs/promises';
import process from 'node:process';
import { decodeGreyPng } from './png-grey.js';

/**
 * Finds source artwork with a composition guide grid baked into the image.
 *
 * Image generators sometimes bake a guide overlay into the frame. It is easy to miss in
 * review — the lines are thin and the eye reads them as scenery — but on a
 * spot-the-difference board it is glaring, and it usually lands in only one of the pair, so
 * every line becomes a difference the player can see and never claim.
 *
 * The earlier version probed only the rule-of-thirds lines and required all four to be
 * covered. That missed every grid drawn at another spacing: `en-phonics-apple` carries a 5x5
 * grid at columns 205/410/614/819, and the thirds it sampled (x=341, x=683) came back at 14%
 * and 3% coverage, so the check reported the file clean while the grid was plainly visible.
 *
 * So scan every column and row instead, and judge by shape rather than position. A full-span
 * line is coverage, not contrast: real scene edges are local, an overlay runs the whole span.
 * A single full-span line is ordinary — a horizon, a table edge, a synthwave scan line — so a
 * grid is only called when the image has at least two of each direction at once, which scenes
 * essentially never produce and overlays always do.
 */

const COVERAGE_THRESHOLD = 0.9;
const CONTRAST_THRESHOLD = 8;
/** Two full-span lines in *both* directions. One of either is scenery; a lattice is not. */
const MIN_LINES_PER_AXIS = 2;

/**
 * True when the image carries a lattice rather than scenery.
 *
 * Exported so `derive-hitboxes.js` can reject the pack on the same evidence instead of a
 * hand-maintained hold-out list — a list went empty once while the comment above it still
 * named a pack, and nothing caught the disagreement.
 */
export function hasGuideGrid(image) {
  const { columns, rows } = fullSpanLines(image);
  return columns.length >= MIN_LINES_PER_AXIS && rows.length >= MIN_LINES_PER_AXIS;
}

function fullSpanLines(image) {
  const { width, height, grey } = image;
  const at = (x, y) => grey[y * width + x];
  const columns = [];
  const rows = [];
  for (let x = 2; x < width - 2; x += 1) {
    let hits = 0;
    for (let y = 2; y < height - 2; y += 1) {
      if (Math.abs(at(x, y) - (at(x - 2, y) + at(x + 2, y)) / 2) > CONTRAST_THRESHOLD) hits += 1;
    }
    if (hits / (height - 4) > COVERAGE_THRESHOLD) columns.push(x);
  }
  for (let y = 2; y < height - 2; y += 1) {
    let hits = 0;
    for (let x = 2; x < width - 2; x += 1) {
      if (Math.abs(at(x, y) - (at(x, y - 2) + at(x, y + 2)) / 2) > CONTRAST_THRESHOLD) hits += 1;
    }
    if (hits / (width - 4) > COVERAGE_THRESHOLD) rows.push(y);
  }
  return { columns: collapse(columns), rows: collapse(rows) };
}

/** A drawn line is a few pixels wide; count it once. */
function collapse(positions) {
  const out = [];
  for (const position of positions) {
    if (out.length > 0 && position - out[out.length - 1] <= 3) {
      out[out.length - 1] = position;
      continue;
    }
    out.push(position);
  }
  return out;
}

export async function checkArtGrid({
  manifestPath = 'content/learning/manifest.v1.json',
  sourceRoot = 'content/learning/source',
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const offenders = [];
  for (const entry of manifest.entries) {
    for (const side of ['a', 'b']) {
      const path = `${sourceRoot}/${entry.key}-${side}.png`;
      let image;
      try {
        image = decodeGreyPng(await fs.readFile(path));
      } catch {
        continue;
      }
      if (image === null) continue;
      const { columns, rows } = fullSpanLines(image);
      if (columns.length >= MIN_LINES_PER_AXIS && rows.length >= MIN_LINES_PER_AXIS) {
        offenders.push({ key: entry.key, side, columns, rows });
      }
    }
  }
  return offenders;
}

if (process.argv[1]?.endsWith('check-art-grid.js')) {
  const offenders = await checkArtGrid();
  for (const { key, side, columns, rows } of offenders) {
    console.log(`[GUIDE GRID] ${key}-${side}.png ${columns.length} column(s), ${rows.length} row(s)`);
  }
  const affected = new Set(offenders.map(({ key }) => key));
  console.log(`[ART GRID CHECK] ${affected.size} affected pack(s)`);
  if (offenders.length > 0) process.exitCode = 1;
}
