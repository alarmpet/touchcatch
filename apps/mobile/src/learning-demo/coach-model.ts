/**
 * First-run coaching.
 *
 * Casual D1 retention sits around 26%, so there is no budget for a tutorial the player has
 * to read and dismiss. Instead the game points at itself while it is being played: three
 * one-line notes, each fired at the moment the thing it describes is happening on screen,
 * each shown once ever and never blocking a tap.
 *
 * The order is deliberate. A player who is told they may answer early before they have
 * seen a letter arrive does not yet know what they would be answering from.
 */

export type CoachStep = 'FIND' | 'LETTER' | 'EARLY_ANSWER';

export const COACH_TEXT: Readonly<Record<CoachStep, string>> = {
  FIND: '두 그림에서 다른 곳을 찾아 눌러 보세요',
  LETTER: '찾을 때마다 정답 글자가 한 칸씩 열려요',
  EARLY_ANSWER: '다 찾지 않아도, 알겠으면 바로 입력하세요',
};

/** How long each note stays up before it is dismissed and marked as seen. */
export const COACH_MS = 2800;

export type CoachInput = Readonly<{
  phase: 'FIND' | 'QUIZ' | 'COMPLETE';
  claimedCount: number;
  finalUnlocked: boolean;
  missionActive: boolean;
  seen: readonly CoachStep[];
}>;

/**
 * The note to show right now, or null.
 *
 * Returns nothing while a word hunt owns the board: two prompts at once would compete for
 * the same glance, and the hunt is the one on a timer.
 */
export function nextCoachStep(input: CoachInput): CoachStep | null {
  if (input.phase !== 'FIND' || input.missionActive) return null;
  const unseen = (step: CoachStep) => !input.seen.includes(step);

  if (input.claimedCount === 0) return unseen('FIND') ? 'FIND' : null;
  if (unseen('LETTER')) return 'LETTER';
  if (input.finalUnlocked && unseen('EARLY_ANSWER')) return 'EARLY_ANSWER';
  return null;
}
