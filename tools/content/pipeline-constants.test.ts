import { describe, expect, it } from 'vitest';
import {
  ADAPTIVE_RETRY_POLICY,
  MAX_OUTSIDE_CHANGED_RATIO,
  MIN_CLUSTER_CHANGED_PIXELS,
  PIXEL_THRESHOLD,
  RADIUS_BY_DIFFICULTY,
} from './pipeline-constants.js';

describe('content pipeline constants', () => {
  it('pins the baseline detector values used by the documented pipeline', () => {
    expect(RADIUS_BY_DIFFICULTY).toEqual({ BEGINNER: 0.085, INTERMEDIATE: 0.07, ADVANCED: 0.055 });
    expect(PIXEL_THRESHOLD).toBe(75);
    expect(MIN_CLUSTER_CHANGED_PIXELS).toBe(150);
    expect(MAX_OUTSIDE_CHANGED_RATIO).toBe(0.08);
  });

  it('keeps adaptive retries explicit and ordered', () => {
    expect(ADAPTIVE_RETRY_POLICY).toEqual([
      { threshold: 90, radiusScale: 1.25, maxOutsideChangedRatio: 0.15 },
      { threshold: 100, radiusScale: 1.35, maxOutsideChangedRatio: 0.18 },
      { threshold: 120, radiusScale: 1.45, maxOutsideChangedRatio: 0.22 },
      { threshold: 140, radiusScale: 1.55, maxOutsideChangedRatio: 0.25 },
    ]);
  });
});
