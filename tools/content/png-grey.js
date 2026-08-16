import zlib from 'node:zlib';

/**
 * Minimal greyscale PNG decode: non-interlaced, 8-bit, grey/RGB/RGBA.
 *
 * Kept dependency-free so the content checks can run in the same install as the rest of
 * the repo tooling. Returns null for anything outside that shape rather than guessing.
 */
export function decodeGreyPng(buffer) {
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  for (let offset = 8; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (depth !== 8 || interlace !== 0) return null;
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (channels === undefined) return null;

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const grey = new Uint8Array(width * height);
  // Colour is kept alongside luminance: a great many spot-the-difference edits are pure
  // hue changes (a red barrow becomes yellow) that greyscale flattens to nothing.
  const rgb = new Uint8Array(width * height * 3);
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    for (let index = 0; index < stride; index += 1) {
      const value = raw[cursor + index];
      const left = index >= channels ? current[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      let restored;
      if (filter === 0) restored = value;
      else if (filter === 1) restored = value + left;
      else if (filter === 2) restored = value + up;
      else if (filter === 3) restored = value + ((left + up) >> 1);
      else {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        restored = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
      }
      current[index] = restored & 0xff;
    }
    cursor += stride;
    for (let x = 0; x < width; x += 1) {
      const base = x * channels;
      const r = current[base];
      const g = channels >= 3 ? current[base + 1] : r;
      const b = channels >= 3 ? current[base + 2] : r;
      grey[y * width + x] = (r * 299 + g * 587 + b * 114) / 1000;
      const out = (y * width + x) * 3;
      rgb[out] = r; rgb[out + 1] = g; rgb[out + 2] = b;
    }
    previous.set(current);
  }
  return { width, height, grey, rgb };
}
