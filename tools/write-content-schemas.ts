import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
const check = process.argv.includes('--check');
let drift = false;

for (const [relativePath, schema] of files) {
  const path = resolve(relativePath);
  const expected = `${JSON.stringify(schema, null, 2)}\n`;
  if (check) {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== expected) {
      console.error(`schema drift: ${relativePath}`);
      drift = true;
    }
  } else {
    await writeFile(path, expected, 'utf8');
    console.log(`wrote ${relativePath}`);
  }
}

if (drift) process.exitCode = 1;
