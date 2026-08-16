import console from 'node:console';
import fs from 'node:fs/promises';
import process from 'node:process';
import { decodeGreyPng } from './png-grey.js';

/**
 * Finds source artwork with a composition guide grid baked into the image.
 *
 * Image generators sometimes bake a rule-of-thirds overlay into the frame. It is easy to
 * miss in review — the lines are thin and the eye reads them as scenery — but on a
 * spot-the-difference board it is glaring, and it can differ between the A and B images of
 * a pair, which reads as a difference that is not one.
 *
 * The test is coverage, not contrast: real scene edges near a third-line are local, while
 * an overlay runs the whole span. A line is reported only when all four third-lines are
 * covered along essentially their entire length.
 */

const COVERAGE_THRESHOLD = 0.9;
const CONTRAST_THRESHOLD = 8;

function gridCoverage(image) {
  const { width, height, grey } = image;
  const at = (x, y) => grey[y * width + x];
  const coverages = [];
  for (const fraction of [1 / 3, 2 / 3]) {
    const x = Math.round(width * fraction);
    let hits = 0;
    for (let y = 2; y < height - 2; y += 1) {
      if (Math.abs(at(x, y) - (at(x - 2, y) + at(x + 2, y)) / 2) > CONTRAST_THRESHOLD) hits += 1;
    }
    coverages.push(hits / (height - 4));

    const row = Math.round(height * fraction);
    hits = 0;
    for (let px = 2; px < width - 2; px += 1) {
      if (Math.abs(at(px, row) - (at(px, row - 2) + at(px, row + 2)) / 2) > CONTRAST_THRESHOLD) hits += 1;
    }
    coverages.push(hits / (width - 4));
  }
  return Math.min(...coverages);
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
      const coverage = gridCoverage(image);
      if (coverage > COVERAGE_THRESHOLD) offenders.push({ key: entry.key, side, coverage });
    }
  }
  return offenders;
}

if (process.argv[1]?.endsWith('check-art-grid.js')) {
  const offenders = await checkArtGrid();
  for (const { key, side, coverage } of offenders) {
    console.log(`[GUIDE GRID] ${key}-${side}.png coverage=${(coverage * 100).toFixed(1)}%`);
  }
  console.log(`[ART GRID CHECK] ${offenders.length} affected image(s)`);
}
