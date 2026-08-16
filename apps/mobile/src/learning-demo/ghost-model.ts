/**
 * Racing your own previous run of the same board.
 *
 * Competition without matchmaking: the client has no server-validated match, so there is
 * no honest way to race a stranger today. A recording of your own run needs nobody, and it
 * still supplies the thing a leaderboard was supposed to supply — someone to be ahead of.
 *
 * The ghost is always labelled as your own record. Dressing a personal best up as another
 * player would be a lie the player can never catch, which is the worst kind.
 */

export type GhostFind = Readonly<{ id: string; atMs: number }>;

export type GhostRun = Readonly<{
  contentKey: string;
  /** Find order with the elapsed time each one landed. Sorted ascending by `atMs`. */
  finds: readonly GhostFind[];
  solved: boolean;
  score: number;
}>;

/** How many differences the ghost had found by this point in its run. */
export function ghostFindCountBy(run: GhostRun | null, elapsedMs: number): number {
  if (run === null) return 0;
  return run.finds.reduce((count, find) => find.atMs <= elapsedMs ? count + 1 : count, 0);
}

/** The differences the ghost has revealed so far, for drawing its markers. */
export function ghostRevealedIds(run: GhostRun | null, elapsedMs: number): readonly string[] {
  if (run === null) return [];
  return run.finds.filter((find) => find.atMs <= elapsedMs).map((find) => find.id);
}

export type GhostStanding = 'AHEAD' | 'LEVEL' | 'BEHIND';

export function ghostStanding(playerFinds: number, ghostFinds: number): GhostStanding {
  if (playerFinds > ghostFinds) return 'AHEAD';
  return playerFinds === ghostFinds ? 'LEVEL' : 'BEHIND';
}

/**
 * Whether a finished run should replace the stored one.
 *
 * Score first, because score is what the game asks the player to maximise. Speed only
 * breaks ties, and an unsolved run never displaces a solved one however long it ran —
 * otherwise abandoning a board could quietly erase a real personal best.
 */
export function isBetterRun(candidate: GhostRun, incumbent: GhostRun | null): boolean {
  if (incumbent === null) return true;
  if (candidate.solved !== incumbent.solved) return candidate.solved;
  if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
  const finish = (run: GhostRun) => run.finds.at(-1)?.atMs ?? Number.MAX_SAFE_INTEGER;
  return finish(candidate) < finish(incumbent);
}

/** Sorts and freezes a run recorded during play, so stored runs are always well ordered. */
export function sealGhostRun(input: GhostRun): GhostRun {
  return { ...input, finds: [...input.finds].sort((left, right) => left.atMs - right.atMs) };
}
