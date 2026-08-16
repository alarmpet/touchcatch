/**
 * The spoiler-free result card.
 *
 * Wordle's viral engine was not the puzzle, it was a shareable grid that said how you did
 * without saying what the answer was. This is the same idea fitted to our loop, and it is
 * the reason it can exist at all: our score is legible as a picture. The grid shows how
 * many differences the player needed before they cracked the word, so **fewer marks is
 * more impressive** — the opposite of a grind flex, and honest about what the game rewards.
 *
 * Hard rule: the answer, its mask, and the hint text never appear here. `buildShareCard`
 * takes no parameter that could carry them, which is the cheapest way to keep that true.
 */

export type ShareCardInput = Readonly<{
  category: 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';
  stageNumber: number;
  /**
   * Present only for the daily board. It is what makes two cards comparable — without it
   * a reader has no way to know the sender solved the same picture they did.
   */
  dailyNumber?: number;
  foundCount: number;
  totalDifferences: number;
  wordHuntCount: number;
  hintsUsed: number;
  score: number;
  solved: boolean;
}>;

const CATEGORY_LABEL: Readonly<Record<ShareCardInput['category'], string>> = {
  ENGLISH: '영어 단어',
  PROVERB: '속담',
  IDIOM: '사자성어',
  GENERAL_KNOWLEDGE: '상식',
};

const FOUND = '🔍';
const MISSING = '⬜';
const WORD_HUNT = '🔤';

/**
 * One row of marks, one per difference on the board, plus a mark per solved word hunt.
 *
 * A very wide board would wrap badly in a chat app, so the row wraps every ten marks
 * rather than running off the line.
 */
export function buildShareGrid(input: ShareCardInput): string {
  const total = Math.max(0, Math.floor(input.totalDifferences));
  const found = Math.min(Math.max(0, Math.floor(input.foundCount)), total);
  const marks = [
    ...Array.from({ length: found }, () => FOUND),
    ...Array.from({ length: total - found }, () => MISSING),
    ...Array.from({ length: Math.max(0, Math.floor(input.wordHuntCount)) }, () => WORD_HUNT),
  ];
  const rows: string[] = [];
  for (let start = 0; start < marks.length; start += 10) {
    rows.push(marks.slice(start, start + 10).join(''));
  }
  return rows.join('\n');
}

export function buildShareCard(input: ShareCardInput): string {
  const cleared = input.totalDifferences > 0 && input.foundCount >= input.totalDifferences;
  // The deduction jump is the moment worth bragging about, so it gets its own mark.
  const outcome = !input.solved
    ? '⏹ 미완료'
    : cleared
      ? `🏁 전부 찾고 정답 · ${input.score}점`
      : `⚡ ${input.foundCount}개만 찾고 정답 · ${input.score}점`;
  const hint = input.hintsUsed > 0 ? ` · 힌트 ${input.hintsUsed}` : '';

  const title = input.dailyNumber === undefined
    ? `TouchCatch · ${CATEGORY_LABEL[input.category]} ${input.stageNumber}`
    : `TouchCatch #${input.dailyNumber} · ${CATEGORY_LABEL[input.category]}`;

  return [
    title,
    buildShareGrid(input),
    `${outcome}${hint}`,
  ].join('\n');
}
