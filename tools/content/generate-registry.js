import console from 'node:console';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import process from 'node:process';

function toCamelCase(key) {
  return key.replace(/-([a-z0-9])/g, (_, character) =>
    character.toUpperCase(),
  );
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(Object.is(value, -0) ? 0 : value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function semanticAdmissionHash(category, bundle) {
  const challenge = bundle.privateSolution.finalChallenge;
  return createHash('sha256').update(canonicalJson({
    category,
    canonicalAnswer: challenge.canonicalAnswer,
    hintUnits: challenge.hintUnits,
    hintLadder: challenge.hintLadder,
    meaning: challenge.meaning,
    reviewedHanja: challenge.reviewedHanja ?? null,
    hanjaReviewStatus: challenge.hanjaReviewStatus ?? null,
    privateSolutionHash: bundle.privateSolution.privateSolutionHash,
  }), 'utf8').digest('hex');
}

export async function generateMobileRegistry({
  manifestPath = 'content/learning/manifest.v1.json',
  draftsRoot = 'content/learning/drafts',
  outputPath = 'apps/mobile/src/learning-demo/registry.ts',
} = {}) {
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, 'utf8'),
  );
  const draftFiles = await fs.readdir(draftsRoot);
  const availableKeys = new Set(
    draftFiles
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', '')),
  );

  const imports = [];
  const entries = [];
  for (const entry of manifest.entries) {
    if (!availableKeys.has(entry.key)) throw new Error(`MISSING_DRAFT:${entry.key}`);
    const bundle = JSON.parse(
      await fs.readFile(`${draftsRoot}/${entry.key}.json`, 'utf8'),
    );
    const admission = entry.hintLadderAdmission;
    let admissionLiteral;
    if (admission.status === 'ADMITTED') {
      if (
        entry.rankedEligible !== true ||
        admission.stepCount !== 5 ||
        !Array.isArray(bundle.privateSolution.finalChallenge.hintLadder) ||
        bundle.privateSolution.finalChallenge.hintLadder.length !== 5 ||
        semanticAdmissionHash(entry.category, bundle) !== admission.hash
      ) {
        throw new Error(`HINT_ADMISSION_DRIFT:${entry.key}`);
      }
      admissionLiteral = `{ status: 'ADMITTED', rankedEligible: true, admissionHash: '${admission.hash}', hintLadder: ${JSON.stringify(bundle.privateSolution.finalChallenge.hintLadder)} }`;
    } else {
      if (entry.rankedEligible || admission.hash !== null) {
        throw new Error(`INVALID_HINT_ADMISSION:${entry.key}`);
      }
      admissionLiteral = `{ status: '${admission.status}', rankedEligible: false, admissionHash: null }`;
    }
    const variable = toCamelCase(entry.key);
    imports.push(
      `const ${variable} = require('../../../../content/learning/drafts/${entry.key}.json') as unknown as Bundle;`,
    );
    entries.push(
      `  buildDemoEntry('${entry.category}', ${variable}, { imageA: require('../../../../content/learning/source/${entry.key}-a.png'), imageB: require('../../../../content/learning/source/${entry.key}-b.png') }, ${admissionLiteral}),`,
    );
  }

  const code = `// GENERATED CODE - DO NOT EDIT MANUALLY
// Generated from content/learning/manifest.v1.json by tools/content/generate-registry.js

import { buildDemoEntry, type Bundle } from './data';

declare const require: (path: string) => unknown;

${imports.join('\n')}

// DEV-only registry: private solutions never cross a network or production API boundary.
export const learningDemoEntries = [
${entries.join('\n')}
] as const;
`;

  await fs.writeFile(outputPath, code, 'utf8');
  console.log(
    `[REGISTRY GENERATED] ${entries.length} entries written to ${outputPath}`,
  );
}

if (process.argv[1]?.endsWith('generate-registry.js')) {
  await generateMobileRegistry();
}
