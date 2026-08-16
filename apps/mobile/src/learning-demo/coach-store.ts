import type { CoachStep } from './coach-model';

/**
 * Which coaching notes this device has already seen.
 *
 * Backed by the `localStorage` polyfill that `expo-sqlite/localStorage/install` puts in
 * place for the Supabase client, so this adds no dependency. Every access is guarded: if
 * the polyfill has not been installed, or storage throws, coaching simply reverts to
 * per-session behaviour rather than taking the screen down with it.
 */
const KEY = 'touchcatch.coach.seen.v1';

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate !== undefined && typeof candidate.getItem === 'function' ? candidate : null;
  } catch {
    return null;
  }
}

export function readSeenCoachSteps(): readonly CoachStep[] {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw === null || raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Unknown values are dropped rather than trusted: a stale or hand-edited entry must
    // not be able to suppress a note that was never actually shown.
    return parsed.filter((value): value is CoachStep =>
      value === 'FIND' || value === 'LETTER' || value === 'EARLY_ANSWER');
  } catch {
    return [];
  }
}

export function writeSeenCoachSteps(steps: readonly CoachStep[]): void {
  try {
    storage()?.setItem(KEY, JSON.stringify([...new Set(steps)]));
  } catch {
    // Coaching is a nicety; losing it is never worth surfacing an error to the player.
  }
}
