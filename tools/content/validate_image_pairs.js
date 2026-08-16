/**
 * tools/content/validate_image_pairs.js — v2 (SSOT & Visual Delta Aligned)
 * 
 * Validates generated Image A/B pairs by calling auto-detect-delta
 * with difficulty-aware radius and visual-delta gate requirements.
 */

import { findChangedRegions } from './auto-detect-delta.js';
import { RADIUS_BY_DIFFICULTY, EXPECTED_DIFFERENCES, QA_MIN_ACCEPTABLE_CLUSTERS } from './pipeline-constants.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_DIR = 'content/learning/source';
const CATALOG_PATH = 'content/learning/catalog.v1.json';

async function loadCatalogMap() {
  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf-8');
    const catalog = JSON.parse(raw);
    const map = new Map();
    for (const entry of catalog.entries) {
      map.set(entry.key, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function validatePair(packId, catalogMap, sourceDir = SOURCE_DIR) {
  const imageAPath = path.join(sourceDir, `${packId}-a.png`);
  const imageBPath = path.join(sourceDir, `${packId}-b.png`);

  try {
    await fs.access(imageAPath);
    await fs.access(imageBPath);
  } catch {
    return {
      packId,
      status: 'MISSING_FILES',
      message: `Image files not found for ${packId}`,
      detectedChanges: 0,
    };
  }

  const catalogEntry = catalogMap.get(packId);
  const difficulty = catalogEntry?.difficulty || 'INTERMEDIATE';

  try {
    const regions = await findChangedRegions(imageAPath, imageBPath, difficulty);
    const detectedCount = regions.length;

    let status;
    if (detectedCount >= EXPECTED_DIFFERENCES) {
      status = 'PASS';
    } else if (detectedCount >= QA_MIN_ACCEPTABLE_CLUSTERS) {
      status = 'WARN';
    } else {
      status = 'FAIL';
    }

    return {
      packId,
      difficulty,
      status,
      detectedChanges: detectedCount,
      expectedChanges: EXPECTED_DIFFERENCES,
      regions: regions.map(r => ({
        cx: r.cx.toFixed(3),
        cy: r.cy.toFixed(3),
        pixelCount: r.points ? r.points.length : 0,
      })),
    };
  } catch (err) {
    return {
      packId,
      difficulty,
      status: 'ERROR',
      message: err.message,
      detectedChanges: 0,
    };
  }
}

async function validateAll(maxPacks = null, sourceDir = SOURCE_DIR) {
  const catalogMap = await loadCatalogMap();
  const files = await fs.readdir(sourceDir);
  let packIds = [...new Set(
    files
      .filter(f => f.endsWith('-a.png'))
      .map(f => f.replace('-a.png', ''))
  )].sort();

  if (maxPacks && maxPacks > 0) {
    packIds = packIds.slice(0, maxPacks);
  }

  console.log(`\n🔍 Validating ${packIds.length} image pairs with SSOT difficulty thresholds...\n`);

  const results = [];
  for (const packId of packIds) {
    const result = await validatePair(packId, catalogMap, sourceDir);
    const icon = result.status === 'PASS' ? '✅' :
                 result.status === 'WARN' ? '⚠️' :
                 result.status === 'FAIL' ? '❌' : '🔴';
    console.log(`  ${icon} ${packId} [${result.difficulty}]: ${result.detectedChanges}/${EXPECTED_DIFFERENCES} changes detected [${result.status}]`);
    results.push(result);
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR' || r.status === 'MISSING_FILES').length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 SSOT QA VALIDATION SUMMARY`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  ✅ PASS:    ${passed}`);
  console.log(`  ⚠️  WARN:    ${warned}`);
  console.log(`  ❌ FAIL:    ${failed}`);
  console.log(`  🔴 ERROR:   ${errors}`);
  console.log(`  📦 TOTAL:   ${results.length}`);

  return results;
}

const args = process.argv.slice(2);
if (args.includes('--all')) {
  validateAll().catch(console.error);
} else if (args.includes('--max-packs')) {
  const idx = args.indexOf('--max-packs');
  const count = parseInt(args[idx + 1] || '5', 10);
  validateAll(count).catch(console.error);
} else if (args.length > 0) {
  const packPath = args[0];
  const packId = path.basename(packPath);
  loadCatalogMap().then(map => validatePair(packId, map)).then(res => console.log(JSON.stringify(res, null, 2))).catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node tools/content/validate_image_pairs.js <pack-id>');
  console.log('  node tools/content/validate_image_pairs.js --max-packs 5');
  console.log('  node tools/content/validate_image_pairs.js --all');
}
