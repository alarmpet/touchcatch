import fs from 'node:fs/promises';
import { convertNonDestructive } from './convert-png.js';
import { findChangedRegions } from './auto-detect-delta.js';
import { generateMobileRegistry } from './generate-registry.js';
import { validateCatalog } from './validate-catalog.js';
import { execSync } from 'node:child_process';

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Strict Spot-the-Difference Full-Bleed Policy:
 * 1. NO Floating Isometric Islands or Voxel Dioramas
 * 2. NO Top Banners, Split Screens, or Text
 * 3. NO Blank Margins - Canvas MUST be 100% full-bleed environment
 */
export async function batchBuildKey(key) {
  console.log(`\n========================================`);
  console.log(`[BATCH BUILD] Processing pack key: ${key}`);
  console.log(`========================================`);

  const rawAExists = await fileExists(`content/learning/raw/${key}-a.png`);
  const sourceAExists = await fileExists(`content/learning/source/${key}-a.png`);

  if (!rawAExists && !sourceAExists) {
    console.log(`[SKIP] Source images for key '${key}' not found.`);
    return false;
  }

  // 1. Non-destructive PNG Conversion
  await convertNonDestructive(key);

  // 2. Read Catalog Entry
  const catalogBuf = await fs.readFile('content/learning/catalog.v1.json', 'utf-8');
  const catalog = JSON.parse(catalogBuf);
  const entry = catalog.entries.find(e => e.key === key);

  if (!entry) {
    console.log(`[SKIP] Entry '${key}' not found in catalog.v1.json.`);
    return false;
  }

  const difficulty = entry.difficulty || 'INTERMEDIATE';
  const geomPath = `content/learning/geometry/${key}.json`;

  // 3. Preserve existing geometry if valid, or auto-detect non-overlapping regions
  let hasValidGeom = false;
  if (await fileExists(geomPath)) {
    try {
      execSync(`node tools/content/build-learning-entry.js ${key}`, { stdio: 'pipe' });
      hasValidGeom = true;
      console.log(`[GEOMETRY VALIDATED] Preserving existing valid geometry for ${key}`);
    } catch {
      hasValidGeom = false;
    }
  }

  if (!hasValidGeom) {
    const regions = await findChangedRegions(
      `content/learning/source/${key}-a.png`,
      `content/learning/source/${key}-b.png`,
      difficulty
    );

    const r1 = regions[0] ?? { cx: 0.3, cy: 0.3, r: 0.07 };
    const r2 = regions[1] ?? { cx: 0.7, cy: 0.3, r: 0.07 };
    const r3 = regions[2] ?? { cx: 0.5, cy: 0.7, r: 0.07 };

    const geomData = {
      policy: { pixelThreshold: 60, minChangedPixelsPerRegion: 24, maxOutsideChangedRatio: 0.15 },
      differences: regions,
      wordHunts: [
        { id: "word_1", kind: "NORMAL", publicPrompt: `Find item 1 in ${key}`, cx: r1.cx, cy: r1.cy, r: r1.r + 0.005 },
        { id: "word_2", kind: "NORMAL", publicPrompt: `Find item 2 in ${key}`, cx: r2.cx, cy: r2.cy, r: r2.r },
        { id: "word_3", kind: "SPECIAL", publicPrompt: `Find item 3 in ${key}`, cx: r3.cx, cy: r3.cy, r: r3.r }
      ],
      suddenDeath: { id: "sudden_1", cx: r1.cx, cy: r1.cy, r: r1.r + 0.010 }
    };

    await fs.writeFile(geomPath, JSON.stringify(geomData, null, 2), 'utf-8');
    console.log(`[GEOMETRY WRITTEN] ${geomPath} (${regions.length} non-overlapping regions)`);
    execSync(`node tools/content/build-learning-entry.js ${key}`, { stdio: 'inherit' });
  }

  return true;
}

export async function runBatchBuildAll() {
  // Validate catalog schema first to prevent malformed or missing entries from corrupting manifest
  const catalog = await validateCatalog();

  const keys = process.argv.slice(2);
  const targetKeys = keys.length > 0 ? keys : catalog.entries.map(e => e.key);

  let successCount = 0;
  for (const k of targetKeys) {
    const success = await batchBuildKey(k);
    if (success) successCount++;
  }

  // 6. Write Manifest
  console.log(`\n[MANIFEST UPDATE]`);
  execSync(`node tools/content/write-learning-manifest.js`, { stdio: 'inherit' });

  // 7. Generate Registry
  console.log(`\n[REGISTRY GENERATION]`);
  await generateMobileRegistry();

  console.log(`\n🎉 [BATCH BUILD COMPLETE] Successfully processed ${successCount} content packs!`);
}

if (process.argv[1].endsWith('batch-build.js')) {
  await runBatchBuildAll();
}
