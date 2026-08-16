import sharp from 'sharp';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const [key, jpgPath] = process.argv.slice(2);
if (!key || !jpgPath) {
  console.error('Usage: node tools/content/update-image-b.mjs <key> <jpgPath>');
  process.exit(1);
}

async function run() {
  const jpg = await fs.readFile(jpgPath);
  const png = await sharp(jpg).resize(1024, 1024).png().toBuffer();
  
  const sourceBPath = `content/learning/source/${key}-b.png`;
  await fs.writeFile(sourceBPath, png);
  
  const sha256B = createHash('sha256').update(png).digest('hex');
  const bytesB = png.length;
  
  const draftPath = `content/learning/drafts/${key}.json`;
  const draft = JSON.parse(await fs.readFile(draftPath, 'utf8'));
  const oldSha256B = draft.publicContent.imageB.sha256;
  
  draft.publicContent.imageB.sha256 = sha256B;
  draft.publicContent.imageB.encodedBytes = bytesB;
  draft.publicContent.imageB.url = `https://cdn.spot-learn.test/assets/${sha256B}.png`;
  
  if (draft.assetFiles) {
    if (draft.assetFiles[oldSha256B]) {
      draft.assetFiles[sha256B] = draft.assetFiles[oldSha256B];
      delete draft.assetFiles[oldSha256B];
    }
  }
  
  await fs.writeFile(draftPath, JSON.stringify(draft, null, 2) + '\n', 'utf8');
  console.log(`[UPDATED DRAFT & PNG] ${key}: sha256=${sha256B}, bytes=${bytesB}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
