import fs from 'node:fs/promises';
import process from 'node:process';

export function evaluateContentDrift({ manifestEntries, draftKeys, sourceKeys, registrySource }) {
  const manifestKeys = new Set(manifestEntries.map((entry) => entry.key));
  const draftSet = new Set(draftKeys);
  const sourceSet = new Set(sourceKeys);
  const registryKeys = new Set([...registrySource.matchAll(/"key":"([^"]+)"/g)].map((match) => match[1]));
  const errors = [];
  const warnings = [];

  for (const key of manifestKeys) {
    if (!draftSet.has(key)) errors.push(`MISSING_DRAFT:${key}`);
    if (!sourceSet.has(`${key}-a`) || !sourceSet.has(`${key}-b`)) errors.push(`MISSING_SOURCE_PAIR:${key}`);
    if (!registryKeys.has(key)) errors.push(`MISSING_REGISTRY_ENTRY:${key}`);
  }
  for (const entry of manifestEntries) {
    if (entry.rankedEligible === true && entry.hintLadderAdmission?.status !== 'ADMITTED') {
      errors.push(`INVALID_ADMISSION:${entry.key}`);
    }
  }
  for (const key of draftSet) {
    if (!manifestKeys.has(key)) warnings.push(`ORPHAN_DRAFT:${key}`);
  }
  for (const key of registryKeys) {
    if (!manifestKeys.has(key)) errors.push(`STALE_REGISTRY_ENTRY:${key}`);
  }
  for (const key of sourceSet) {
    const baseKey = key.endsWith('-a') || key.endsWith('-b') ? key.slice(0, -2) : key;
    if (!manifestKeys.has(baseKey)) warnings.push(`ORPHAN_SOURCE:${key}`);
  }

  return {
    ok: errors.length === 0,
    errors: errors.sort(),
    warnings: warnings.sort(),
    counts: {
      manifest: manifestKeys.size,
      drafts: draftSet.size,
      sourcePairs: [...sourceSet].filter((key) => key.endsWith('-a')).length,
      registry: registryKeys.size,
    },
  };
}

async function readKeys(root, suffix) {
  const files = await fs.readdir(root);
  return files.filter((file) => file.endsWith(suffix)).map((file) => file.slice(0, -suffix.length));
}

export async function checkContentDrift({
  manifestPath = 'content/learning/manifest.v1.json',
  draftsRoot = 'content/learning/drafts',
  sourceRoot = 'content/learning/source',
  registryPath = 'apps/mobile/src/learning-demo/registry.ts',
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const result = evaluateContentDrift({
    manifestEntries: manifest.entries,
    draftKeys: await readKeys(draftsRoot, '.json'),
    sourceKeys: await readKeys(sourceRoot, '.png'),
    registrySource: await fs.readFile(registryPath, 'utf8'),
  });
  return result;
}

if (process.argv[1]?.endsWith('check-content-drift.js')) {
  const result = await checkContentDrift();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
