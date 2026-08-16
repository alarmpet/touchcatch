import console from 'node:console';
import fs from 'node:fs/promises';
import process from 'node:process';

/**
 * Emits every admitted pack as preview-safe demo entries.
 *
 * The full registry (`generate-registry.js`) carries `canonicalAnswer`,
 * `privateSolutionHash`, `contentRevisionId` and `hintAdmissionHash` — the plumbing the
 * server uses to validate a submission. `production-boundary.test.ts` keeps that file out
 * of the route graph so none of it is ever bundled into a shipped client.
 *
 * The daily board needs breadth, not that plumbing: with only the three hand-authored
 * packs it repeats every three days. So this generator projects the same drafts down to
 * what a local demo actually plays with, and emits none of those four fields. `title` is
 * still present because the demo checks answers on device; that is the existing posture of
 * the hand-written preview packs, and it is why the route stays behind `__DEV__`.
 */

const FORBIDDEN = ['canonicalAnswer', 'privateSolutionHash', 'contentRevisionId', 'hintAdmissionHash'];

/**
 * Packs held out of the preview pool because their artwork is defective.
 *
 * `en-camaraderie-campfire-a.png` carries a rule-of-thirds guide grid baked into the
 * image: four lines spanning 99.9% of the frame, absent from its `-b` pair. It is a
 * visible defect on a board the daily rotation would otherwise serve.
 *
 * Held out rather than repaired. The draft pins `publicContent.imageA.sha256` to this
 * exact file, so editing the PNG is a governed content change, not a quiet fix — and
 * inpainting four full-length lines through a detailed scene trades a grid for a smear.
 * The real fix is regenerated art; delete the entry here when that lands.
 *
 * `tools/content/check-art-grid.js` finds these.
 */
/**
 * Held out for a reason no measurement of the difference map can see.
 *
 * `en-camaraderie-campfire-a.png` has a rule-of-thirds guide grid baked into the frame,
 * absent from its `-b` pair. Found by `tools/content/check-art-grid.js`. The draft pins
 * `publicContent.imageA.sha256` to this exact file, so repairing the PNG is a governed
 * content change; the real fix is regenerated art, and this line goes when that lands.
 *
 * Packs whose *hitboxes* were wrong are not listed here — those are rejected by
 * `derive-hitboxes.js` on evidence, so the list cannot silently go stale.
 */
const DEFECTIVE_ART = new Set();

export async function generatePreviewRegistry({
  manifestPath = 'content/learning/manifest.v1.json',
  draftsRoot = 'content/learning/drafts',
  hitboxPath = 'content/learning/derived-hitboxes.v1.json',
  wordHuntPath = 'content/learning/word-hunts.curated.v1.json',
  outputPath = 'apps/mobile/src/learning-demo/preview-registry.generated.ts',
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const derived = JSON.parse(await fs.readFile(hitboxPath, 'utf8')).packs;
  /**
   * Word hunts come from a curated file, never from the drafts. The drafts' hunt
   * coordinates are copies of their difference coordinates, which are themselves not on
   * the artwork — using them would name an object and then reject the tap that finds it.
   */
  const curatedHunts = JSON.parse(await fs.readFile(wordHuntPath, 'utf8')).packs;

  const entries = [];
  for (const entry of manifest.entries) {
    if (DEFECTIVE_ART.has(entry.key)) continue;
    // Hitboxes come from the artwork, not the draft. The drafts' coordinates do not
    // reliably sit on the pictures' actual differences, which makes a board unclearable.
    const hitboxes = derived[entry.key];
    if (hitboxes === undefined || !hitboxes.usable) continue;
    const bundle = JSON.parse(await fs.readFile(`${draftsRoot}/${entry.key}.json`, 'utf8'));
    const challenge = bundle.privateSolution.finalChallenge;
    const projected = {
      key: `daily-${entry.key}`,
      category: entry.category,
      preferredInputSurface: entry.preferredInputSurface,
      assistPattern: entry.assistPattern,
      title: challenge.canonicalAnswer,
      differences: hitboxes.differences.map((difference) => ({
        id: difference.id,
        imageA: { cx: difference.cx, cy: difference.cy, r: difference.r },
        imageB: { cx: difference.cx, cy: difference.cy, r: difference.r },
      })),
      prompt: challenge.meaning.prompt,
      options: challenge.meaning.options,
      correctOptionId: challenge.meaning.correctOptionId,
      hintUnits: challenge.hintUnits,
      ...(curatedHunts[entry.key]
        ? {
          wordHunts: curatedHunts[entry.key].map((hunt) => ({
            missionId: hunt.missionId,
            kind: hunt.kind,
            publicPrompt: hunt.publicPrompt,
            imageA: { cx: hunt.cx, cy: hunt.cy, r: hunt.r },
            imageB: { cx: hunt.cx, cy: hunt.cy, r: hunt.r },
          })),
        }
        : {}),
    };
    entries.push(
      `  { ...${JSON.stringify(projected)}, imageA: require('../../../../content/learning/source/${entry.key}-a.png'), imageB: require('../../../../content/learning/source/${entry.key}-b.png') },`,
    );
  }

  const code = `/* eslint-disable @typescript-eslint/no-require-imports -- Expo statically bundles local image assets through require(). */
// GENERATED CODE - DO NOT EDIT MANUALLY
// Generated from content/learning/manifest.v1.json by tools/content/generate-preview-registry.js
//
// Preview-safe projection: carries no canonical answer field, private solution hash,
// content revision id or hint admission hash. See the generator for why.

import type { LearningDemoEntry } from './LearningDemoScreen';

export const generatedPreviewEntries: readonly LearningDemoEntry[] = [
${entries.join('\n')}
];
`;

  // The whole point of this file is what it leaves out, so the guarantee is checked here
  // as well as in the boundary test — a generator that quietly regressed would otherwise
  // ship the answer key on the next content change.
  for (const field of FORBIDDEN) {
    if (code.includes(field)) throw new Error(`PREVIEW_REGISTRY_LEAK:${field}`);
  }

  await fs.writeFile(outputPath, code, 'utf8');
  console.log(`[PREVIEW REGISTRY GENERATED] ${entries.length} entries written to ${outputPath}`);
  return { count: entries.length, code };
}

if (process.argv[1]?.endsWith('generate-preview-registry.js')) {
  await generatePreviewRegistry();
}
