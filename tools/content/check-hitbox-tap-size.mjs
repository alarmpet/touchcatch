#!/usr/bin/env node
/**
 * Reports hitboxes whose tap target falls below the platform minimum.
 *
 * Why: normalized radii say nothing about how big the target actually is under a finger.
 * A radius of 0.03 is a ~22pt diameter on the baseline viewport, roughly half the 44pt
 * iOS minimum. Published research puts tap error rates near 15% at 24x24 and 3% at 44x44,
 * so undersized objectives read as "the game did not register my tap" rather than
 * "I tapped the wrong place".
 *
 * Baseline assumption (stated, not hidden): the frozen theme pins the baseline viewport at
 * 390pt wide with 16pt screen padding per side, so a full-bleed board is 358pt across.
 * Boards that render narrower than that are worse, never better, so this is a floor.
 *
 * Exit code is 0 unless --strict is passed. The current fixture packs predate this rule and
 * carry a privateSolutionHash, so retrofitting them is a separate, deliberate migration.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const BASELINE_VIEWPORT_PT = 390;
const SCREEN_PADDING_PT = 16;
const BOARD_WIDTH_PT = BASELINE_VIEWPORT_PT - SCREEN_PADDING_PT * 2;
const MIN_TAP_DIAMETER_PT = 44;
const MIN_NORMALIZED_RADIUS = MIN_TAP_DIAMETER_PT / BOARD_WIDTH_PT / 2;

const strict = process.argv.includes('--strict');
const root = process.cwd();
const findings = [];

function inspect(source, label, circle) {
  if (!circle || typeof circle.r !== 'number') return;
  if (circle.r >= MIN_NORMALIZED_RADIUS) return;
  findings.push({
    source,
    target: label,
    radius: circle.r,
    diameterPt: Number((circle.r * 2 * BOARD_WIDTH_PT).toFixed(1)),
  });
}

const fixtureRoot = resolve(root, 'content/fixtures/valid');
if (existsSync(fixtureRoot)) {
  for (const file of readdirSync(fixtureRoot).filter((name) => name.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(fixtureRoot, file), 'utf8'));
    const solution = parsed.privateSolution;
    if (!solution) continue;
    for (const difference of solution.differences ?? []) {
      inspect(`content/fixtures/valid/${file}`, `difference:${difference.objectiveId}`, difference.hitboxes?.imageA);
    }
    for (const hunt of solution.wordHunts ?? []) {
      inspect(`content/fixtures/valid/${file}`, `wordHunt:${hunt.missionId}`, hunt.hitboxes?.imageA);
    }
    inspect(`content/fixtures/valid/${file}`, 'suddenDeath', solution.suddenDeath?.hitboxes?.imageA);
  }
}

const report = {
  schemaVersion: 1,
  baseline: {
    viewportPt: BASELINE_VIEWPORT_PT,
    boardWidthPt: BOARD_WIDTH_PT,
    minTapDiameterPt: MIN_TAP_DIAMETER_PT,
    minNormalizedRadius: Number(MIN_NORMALIZED_RADIUS.toFixed(4)),
  },
  strict,
  violationCount: findings.length,
  violations: findings,
};

console.log(JSON.stringify(report, null, 2));
if (strict && findings.length > 0) process.exit(1);
