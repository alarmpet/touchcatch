import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

sharp.cache(false);

export async function convertNonDestructive(name) {
  const rawFileA = `content/learning/raw/${name}-a.png`;
  const rawFileB = `content/learning/raw/${name}-b.png`;
  const sourceFileA = `content/learning/source/${name}-a.png`;
  const sourceFileB = `content/learning/source/${name}-b.png`;

  // If raw files exist, convert from raw to source (non-destructive)
  let fileA = rawFileA;
  let fileB = rawFileB;

  try {
    await fs.access(rawFileA);
    await fs.access(rawFileB);
  } catch (err) {
    // Fall back to source if raw directory is not populated yet
    fileA = sourceFileA;
    fileB = sourceFileB;
  }

  const [bufA, bufB] = await Promise.all([
    fs.readFile(fileA),
    fs.readFile(fileB)
  ]);

  const [pngA, pngB] = await Promise.all([
    sharp(bufA).png().toBuffer(),
    sharp(bufB).png().toBuffer()
  ]);

  await Promise.all([
    fs.writeFile(sourceFileA, pngA),
    fs.writeFile(sourceFileB, pngB)
  ]);

  console.log(`[PNG CONVERTED non-destructively] ${name}`);
}

const targetKey = process.argv[2];
if (targetKey) {
  await convertNonDestructive(targetKey);
} else {
  // Dynamic directory scan (no hardcoded arrays)
  const dir = 'content/learning/source';
  const files = await fs.readdir(dir);
  const keys = new Set();

  for (const f of files) {
    if (f.endsWith('-a.png')) {
      keys.add(f.replace('-a.png', ''));
    }
  }

  for (const key of keys) {
    await convertNonDestructive(key);
  }
}
