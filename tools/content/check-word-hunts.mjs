#!/usr/bin/env node
/**
 * Validates curated word hunt targets.
 *
 * Word hunts are the one piece of content here that cannot be derived. "Where do the two
 * pictures differ" is arithmetic; "where is the prism" is not, so these coordinates are
 * placed by eye against the source artwork. That makes them the easiest content to get
 * quietly wrong, and a wrong one is worse than a missing one: the prompt names an object,
 * the player taps that object, and the game says they missed.
 *
 * Nothing here can check the part that matters — whether the coordinate is actually on the
 * thing the prompt names. What it can do is make every *mechanical* way of being wrong
 * impossible, so review only has to spend itself on the judgement call.
 *
 * Run: node tools/content/check-word-hunts.mjs [--strict]
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const CURATED = 'content/learning/word-hunts.curated.v1.json';
const DERIVED = 'content/learning/derived-hitboxes.v1.json';

/**
 * The frozen theme pins the baseline viewport at 390pt with 16pt padding a side, so a board
 * is 358pt across and a 44pt tap target needs r >= 44/358/2. Rounded up: anything smaller
 * reads to a player as "the game did not register my tap".
 */
const MIN_RADIUS = 0.062;
const MISSION_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/u;

const strict = process.argv.includes('--strict');
const problems = [];
const fail = (pack, message) => problems.push(`${pack}: ${message}`);

const curated = JSON.parse(readFileSync(CURATED, 'utf8'));
const derived = JSON.parse(readFileSync(DERIVED, 'utf8')).packs;

let huntCount = 0;
for (const [pack, hunts] of Object.entries(curated.packs)) {
  if (derived[pack] === undefined) {
    fail(pack, 'not an admitted pack');
    continue;
  }
  if (!derived[pack].usable) {
    fail(pack, 'pack is not usable, so it never reaches the daily pool');
    continue;
  }
  if (!Array.isArray(hunts) || hunts.length === 0) {
    fail(pack, 'no hunts');
    continue;
  }
  // The ruleset schedules NORMAL, NORMAL, SPECIAL in that order and the demo pairs hunts to
  // it by index, so a pack that lists them in another order gets the wrong spawn times.
  if (hunts.length > 3) fail(pack, `${hunts.length} hunts, but the schedule only has 3 slots`);
  hunts.forEach((hunt, index) => {
    const where = `hunt ${index + 1} (${hunt.missionId ?? 'unnamed'})`;
    const expectedKind = index === hunts.length - 1 && hunts.length === 3 ? 'SPECIAL' : 'NORMAL';
    if (hunt.kind !== expectedKind) fail(pack, `${where} is ${hunt.kind}, expected ${expectedKind}`);
    if (typeof hunt.missionId !== 'string' || !MISSION_ID.test(hunt.missionId)) {
      fail(pack, `${where} missionId must be kebab-case`);
    }
    if (typeof hunt.publicPrompt !== 'string' || hunt.publicPrompt.trim() === '') {
      fail(pack, `${where} has no prompt`);
    }
    for (const axis of ['cx', 'cy', 'r']) {
      if (typeof hunt[axis] !== 'number' || !Number.isFinite(hunt[axis])) {
        fail(pack, `${where} ${axis} is not a number`);
        return;
      }
    }
    if (hunt.r < MIN_RADIUS) {
      fail(pack, `${where} r=${hunt.r} is under the ${MIN_RADIUS} tap floor`);
    }
    // Fully inside the frame: a target clipped by the edge is smaller under the finger than
    // its radius claims, which is the tap floor failing silently.
    for (const [axis, value] of [['cx', hunt.cx], ['cy', hunt.cy]]) {
      if (value - hunt.r < 0 || value + hunt.r > 1) {
        fail(pack, `${where} ${axis}=${value} r=${hunt.r} runs outside the frame`);
      }
    }
    huntCount += 1;
  });

  const ids = hunts.map((hunt) => hunt.missionId);
  if (new Set(ids).size !== ids.length) fail(pack, 'duplicate missionId');

  // Overlapping targets make the prompt ambiguous: one tap satisfies whichever the reducer
  // happens to reach first, so the player learns the wrong thing about their own aim.
  for (let a = 0; a < hunts.length; a += 1) {
    for (let b = a + 1; b < hunts.length; b += 1) {
      const gap = Math.hypot(hunts[a].cx - hunts[b].cx, hunts[a].cy - hunts[b].cy);
      const need = hunts[a].r + hunts[b].r;
      if (gap <= need) {
        fail(pack, `${hunts[a].missionId} and ${hunts[b].missionId} overlap (gap ${gap.toFixed(3)} <= ${need.toFixed(3)})`);
      }
    }
  }
}

const usable = Object.entries(derived).filter(([, pack]) => pack.usable).map(([key]) => key);
const covered = usable.filter((key) => curated.packs[key] !== undefined);
console.log(`word hunts: ${huntCount} targets across ${covered.length}/${usable.length} usable packs`);

if (problems.length > 0) {
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(`${problems.length} problem(s)`);
  process.exit(1);
}
if (strict && covered.length < usable.length) {
  const missing = usable.filter((key) => curated.packs[key] === undefined);
  console.log(`  ${missing.length} pack(s) still have no hunts: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' ...' : ''}`);
  process.exit(1);
}
