import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

sharp.cache(false);

const keys = [
  'ko-proverb-monkeys-tree',
  'ko-proverb-spilled-water',
  'ko-idiom-cheongchul-eoram',
  'en-phonics-bear',
  'en-phonics-cat',
  'en-phonics-dolphin',
  'en-space-blackhole',
  'en-future-robotics',
  'en-profession-architect',
  'en-scenery-coral-reef',
];

const dir = 'content/learning/source';

for (const k of keys) {
  for (const side of ['a', 'b']) {
    const jpg = path.join(dir, `${k}-${side}.jpg`);
    const png = path.join(dir, `${k}-${side}.png`);
    const buf = await fs.readFile(jpg);
    const out = await sharp(buf).resize(1024, 1024, { fit: 'cover' }).png().toBuffer();
    await fs.writeFile(png, out);
    const meta = await sharp(out).metadata();
    console.log(`${k}-${side} ${meta.width}x${meta.height} ${out.length}`);
  }
}
