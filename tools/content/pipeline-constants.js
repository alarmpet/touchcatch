/**
 * tools/content/pipeline-constants.js
 * 
 * Single Source of Truth (SSOT) for all content pipeline constants and thresholds.
 */

export const RADIUS_BY_DIFFICULTY = {
  BEGINNER: 0.085,
  INTERMEDIATE: 0.070,
  ADVANCED: 0.055,
};

export const PIXEL_THRESHOLD = 75;             // Maximum RGB channel difference threshold
export const MIN_CLUSTER_CHANGED_PIXELS = 150;  // Minimum pixels required for a valid change cluster
export const MIN_CHANGED_PIXELS_PER_REGION = 24;// Minimum changed pixels inside a declared region
export const MAX_OUTSIDE_CHANGED_RATIO = 0.08;  // Maximum allowed undeclared changed pixels ratio (8%)
export const EXPECTED_DIFFERENCES = 10;         // Target number of spot-the-difference items per pack
export const QA_MIN_ACCEPTABLE_CLUSTERS = 8;    // Minimum acceptable clusters before triggering retry queue

export const ADAPTIVE_RETRY_POLICY = [
  { threshold: 90, radiusScale: 1.25, maxOutsideChangedRatio: 0.15 },
  { threshold: 100, radiusScale: 1.35, maxOutsideChangedRatio: 0.18 },
  { threshold: 120, radiusScale: 1.45, maxOutsideChangedRatio: 0.22 },
  { threshold: 140, radiusScale: 1.55, maxOutsideChangedRatio: 0.25 },
];
