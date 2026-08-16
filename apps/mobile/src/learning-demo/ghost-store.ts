import { isBetterRun, type GhostFind, type GhostRun } from './ghost-model';

/**
 * Personal best runs, one per board.
 *
 * Same guarded `localStorage` the coach notes use. A ghost is a nicety layered on top of a
 * finished game, so every failure path here ends in "no ghost" rather than an error.
 */
const KEY_PREFIX = 'touchcatch.ghost.v1:';

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate !== undefined && typeof candidate.getItem === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

function isFind(value: unknown): value is GhostFind {
  if (typeof value !== 'object' || value === null) return false;
  const find = value as Partial<GhostFind>;
  return typeof find.id === 'string' && typeof find.atMs === 'number' && Number.isFinite(find.atMs);
}

export function readGhostRun(contentKey: string): GhostRun | null {
  try {
    const raw = storage()?.getItem(`${KEY_PREFIX}${contentKey}`);
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const run = parsed as Partial<GhostRun>;
    // A stored run drives what the player races against, so a malformed one is discarded
    // rather than half-trusted: a ghost with junk timings would be unbeatable or absent.
    if (!Array.isArray(run.finds) || !run.finds.every(isFind)) return null;
    if (typeof run.score !== 'number' || typeof run.solved !== 'boolean') return null;
    return { contentKey, finds: run.finds, solved: run.solved, score: run.score };
  } catch {
    return null;
  }
}

/** Stores the run only if it beats the stored one. Returns what is stored afterwards. */
export function saveGhostRunIfBetter(run: GhostRun): GhostRun | null {
  const incumbent = readGhostRun(run.contentKey);
  if (!isBetterRun(run, incumbent)) return incumbent;
  try {
    storage()?.setItem(`${KEY_PREFIX}${run.contentKey}`, JSON.stringify(run));
  } catch {
    return incumbent;
  }
  return run;
}
