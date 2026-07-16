import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  privateGameSolutionSchema,
  publicGameContentSchema,
  rightsManifestSetSchema,
} from '../packages/contracts/src/content.js';

const files = new Map<string, unknown>([
  ['schemas/game-content.public.schema.json', publicGameContentSchema],
  ['schemas/game-content.private.schema.json', privateGameSolutionSchema],
  ['schemas/rights-manifest.schema.json', rightsManifestSetSchema],
]);
export async function writeContentSchemas(root = '.'): Promise<void> {
  await mkdir(resolve(root, 'schemas'), { recursive: true });
  for (const [relativePath, schema] of files) {
    await writeFile(resolve(root, relativePath), `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  }
}

export async function checkContentSchemas(root = '.'): Promise<string[]> {
  const drift: string[] = [];
  for (const [relativePath, schema] of files) {
    const expected = `${JSON.stringify(schema, null, 2)}\n`;
    const actual = await readFile(resolve(root, relativePath), 'utf8').catch(() => '');
    if (actual !== expected) drift.push(relativePath);
  }
  return drift;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const drift = await checkContentSchemas();
    for (const relativePath of drift) console.error(`schema drift: ${relativePath}`);
    if (drift.length > 0) process.exitCode = 1;
  } else {
    await writeContentSchemas();
    for (const relativePath of files.keys()) console.log(`wrote ${relativePath}`);
  }
}
