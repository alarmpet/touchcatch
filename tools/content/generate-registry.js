import console from 'node:console';
import fs from 'node:fs/promises';
import process from 'node:process';

function toCamelCase(key) {
  return key.replace(/-([a-z0-9])/g, (_, character) =>
    character.toUpperCase(),
  );
}

export async function generateMobileRegistry() {
  const manifest = JSON.parse(
    await fs.readFile('content/learning/manifest.v1.json', 'utf8'),
  );
  const draftFiles = await fs.readdir('content/learning/drafts');
  const availableKeys = new Set(
    draftFiles
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace('.json', '')),
  );

  const imports = [];
  const entries = [];
  for (const entry of manifest.entries) {
    if (!availableKeys.has(entry.key)) throw new Error(`MISSING_DRAFT:${entry.key}`);
    const variable = toCamelCase(entry.key);
    imports.push(
      `const ${variable} = require('../../../../content/learning/drafts/${entry.key}.json') as unknown as Bundle;`,
    );
    entries.push(
      `  buildDemoEntry('${entry.category}', ${variable}, { imageA: require('../../../../content/learning/source/${entry.key}-a.png'), imageB: require('../../../../content/learning/source/${entry.key}-b.png') }),`,
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

  const outputPath = 'apps/mobile/src/learning-demo/registry.ts';
  await fs.writeFile(outputPath, code, 'utf8');
  console.log(
    `[REGISTRY GENERATED] ${entries.length} entries written to ${outputPath}`,
  );
}

if (process.argv[1]?.endsWith('generate-registry.js')) {
  await generateMobileRegistry();
}
