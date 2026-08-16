import sharp from 'sharp';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [key, jpgPath] = process.argv.slice(2);
if (!key || !jpgPath) {
  console.error('Usage: node tools/content/update-image-a.mjs <key> <jpgPath>');
  process.exit(1);
}

async function run() {
  const jpg = await fs.readFile(jpgPath);
  const png = await sharp(jpg).resize(1024, 1024).png().toBuffer();
  
  const sourceAPath = `content/learning/source/${key}-a.png`;
  await fs.writeFile(sourceAPath, png);
  
  const sha256A = createHash('sha256').update(png).digest('hex');
  const bytesA = png.length;
  
  const draftPath = `content/learning/drafts/${key}.json`;
  const draft = JSON.parse(await fs.readFile(draftPath, 'utf8'));
  const oldSha256A = draft.publicContent.imageA.sha256;
  
  draft.publicContent.imageA.sha256 = sha256A;
  draft.publicContent.imageA.encodedBytes = bytesA;
  draft.publicContent.imageA.url = `https://cdn.spot-learn.test/assets/${sha256A}.png`;
  
  if (draft.assetFiles) {
    if (draft.assetFiles[oldSha256A]) {
      draft.assetFiles[sha256A] = draft.assetFiles[oldSha256A];
      delete draft.assetFiles[oldSha256A];
    }
  }
  
  await fs.writeFile(draftPath, JSON.stringify(draft, null, 2) + '\n', 'utf8');
  console.log(`[UPDATED DRAFT & PNG A] ${key}: sha256=${sha256A}, bytes=${bytesA}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
