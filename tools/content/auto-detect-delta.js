import sharp from 'sharp';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RADIUS_BY_DIFFICULTY, PIXEL_THRESHOLD, MIN_CLUSTER_CHANGED_PIXELS } from './pipeline-constants.js';

export async function findChangedRegions(imageAPath, imageBPath, difficulty = 'INTERMEDIATE', pixelThreshold = PIXEL_THRESHOLD) {
  const [a, b] = await Promise.all([
    sharp(imageAPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(imageBPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height, channels } = a.info;

  const r = RADIUS_BY_DIFFICULTY[difficulty] ?? RADIUS_BY_DIFFICULTY.INTERMEDIATE;

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

  // Filter valid clusters
  const validClusters = rawClusters.filter(c => c.points.length >= Math.floor(MIN_CLUSTER_CHANGED_PIXELS / 10));

  // Non-overlap filter
  const finalClusters = [];
  validClusters.sort((a, b) => b.points.length - a.points.length);

  for (const c of validClusters) {
    let overlap = false;
    for (const existing of finalClusters) {
      const dx = c.cx - existing.cx;
      const dy = c.cy - existing.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2 * r) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      finalClusters.push(c);
    }
    if (finalClusters.length >= 10) break;
  }

  return finalClusters.map((c, index) => ({
    id: `diff_${index + 1}`,
    tier: index < 7 ? 'NORMAL' : 'HARD',
    cx: c.cx,
    cy: c.cy,
    r,
    points: c.points
  }));
}

// Only run CLI block when executed directly
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
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
      // fallback
    }

    const regions = await findChangedRegions(
      `content/learning/source/${key}-a.png`,
      `content/learning/source/${key}-b.png`,
      difficulty,
      PIXEL_THRESHOLD
    );
    console.log(JSON.stringify(regions, null, 2));
  }
}
