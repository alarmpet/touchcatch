import sharp from 'sharp';
import fs from 'node:fs/promises';

const RADIUS_BY_DIFFICULTY = {
  BEGINNER: 0.085,
  INTERMEDIATE: 0.070,
  ADVANCED: 0.055
};

export async function findChangedRegions(imageAPath, imageBPath, difficulty = 'INTERMEDIATE', pixelThreshold = 60) {
  const [a, b] = await Promise.all([
    sharp(imageAPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(imageBPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height, channels } = a.info;

  const r = RADIUS_BY_DIFFICULTY[difficulty] ?? 0.070;

  const points = [];
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * channels;
      const diff = Math.max(
        Math.abs((a.data[offset] ?? 0) - (b.data[offset] ?? 0)),
        Math.abs((a.data[offset + 1] ?? 0) - (b.data[offset + 1] ?? 0)),
        Math.abs((a.data[offset + 2] ?? 0) - (b.data[offset + 2] ?? 0))
      );
      if (diff >= pixelThreshold) {
        points.push({ x: (x + 0.5) / width, y: (y + 0.5) / height });
      }
    }
  }

  // Simple greedy clustering
  const rawClusters = [];
  for (const pt of points) {
    let assigned = false;
    for (const c of rawClusters) {
      const dx = pt.x - c.cx, dy = pt.y - c.cy;
      if (dx * dx + dy * dy < (r * 1.2) * (r * 1.2)) {
        c.points.push(pt);
        c.cx = c.points.reduce((sum, p) => sum + p.x, 0) / c.points.length;
        c.cy = c.points.reduce((sum, p) => sum + p.y, 0) / c.points.length;
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      rawClusters.push({ cx: pt.x, cy: pt.y, points: [pt] });
    }
  }

  // Compute exact changed pixel count for each cluster using ROUNDED cx/cy and pixelThreshold 60 matching visual-delta.js
  const clustersWithPixels = rawClusters.map(c => {
    const cx = Number(c.cx.toFixed(3));
    const cy = Number(c.cy.toFixed(3));
    let pixelCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = (x + 0.5) / width;
        const ny = (y + 0.5) / height;
        const dx = nx - cx;
        const dy = ny - cy;
        if (dx * dx + dy * dy <= r * r) {
          const offset = (y * width + x) * channels;
          const diff = Math.max(
            Math.abs((a.data[offset] ?? 0) - (b.data[offset] ?? 0)),
            Math.abs((a.data[offset + 1] ?? 0) - (b.data[offset + 1] ?? 0)),
            Math.abs((a.data[offset + 2] ?? 0) - (b.data[offset + 2] ?? 0))
          );
          if (diff >= pixelThreshold) {
            pixelCount++;
          }
        }
      }
    }
    return { pointsCount: c.points.length, cx, cy, pixelCount };
  });

  // Filter out clusters with < 50 exact changed pixels (guaranteeing it easily passes minChangedPixelsPerRegion: 24)
  const validClusters = clustersWithPixels.filter(c => c.pixelCount >= 50).sort((x, y) => y.pixelCount - x.pixelCount);

  // Non-overlap filter (REQ CONTENT-017: distance >= 2r)
  const selectedClusters = [];
  const minDistance = 2 * r;

  for (const c of validClusters) {
    const overlaps = selectedClusters.some(sc => Math.hypot(sc.cx - c.cx, sc.cy - c.cy) < minDistance);
    if (!overlaps) {
      selectedClusters.push(c);
      if (selectedClusters.length >= 10) break;
    }
  }

  return selectedClusters.map((c, idx) => ({
    id: `difference_${idx + 1}`,
    tier: idx < 7 ? 'NORMAL' : 'HARD',
    cx: c.cx,
    cy: c.cy,
    r
  }));
}

const key = process.argv[2];
if (key) {
  let difficulty = 'INTERMEDIATE';
  try {
    const catalogBuf = await fs.readFile('content/learning/catalog.v1.json', 'utf-8');
    const catalog = JSON.parse(catalogBuf);
    const entry = catalog.entries.find(e => e.key === key);
    if (entry && entry.difficulty) {
      difficulty = entry.difficulty;
    }
  } catch (err) {
    // fallback to default
  }

  const regions = await findChangedRegions(
    `content/learning/source/${key}-a.png`,
    `content/learning/source/${key}-b.png`,
    difficulty,
    60
  );
  console.log(JSON.stringify(regions, null, 2));
}
