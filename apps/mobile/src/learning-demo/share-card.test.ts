import { describe, expect, it } from 'vitest';
import { buildShareCard, buildShareGrid, type ShareCardInput } from './share-card.js';

const base: ShareCardInput = {
  category: 'PROVERB',
  stageNumber: 2,
  foundCount: 4,
  totalDifferences: 10,
  wordHuntCount: 0,
  hintsUsed: 0,
  score: 187,
  solved: true,
};

describe('share card', () => {
  it('draws one mark per difference, found first', () => {
    expect(buildShareGrid(base)).toBe('🔍🔍🔍🔍⬜⬜⬜⬜⬜⬜');
    expect(buildShareGrid({ ...base, foundCount: 0 })).toBe('⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜');
    expect(buildShareGrid({ ...base, foundCount: 10 })).toBe('🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍');
  });

  it('appends a mark per solved word hunt', () => {
    expect(buildShareGrid({ ...base, foundCount: 2, totalDifferences: 3, wordHuntCount: 2 }))
      .toBe('🔍🔍⬜🔤🔤');
  });

  it('wraps wide boards instead of running off the line', () => {
    expect(buildShareGrid({ ...base, foundCount: 12, totalDifferences: 14 }))
      .toBe('🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍\n🔍🔍⬜⬜');
  });

  it('marks an early deduction differently from a full clear', () => {
    // Answering from a partial pattern is the moment the game is built around.
    expect(buildShareCard(base)).toBe([
      'TouchCatch · 속담 2',
      '🔍🔍🔍🔍⬜⬜⬜⬜⬜⬜',
      '⚡ 4개만 찾고 정답 · 187점',
    ].join('\n'));

    expect(buildShareCard({ ...base, foundCount: 10, score: 246 })).toContain('🏁 전부 찾고 정답 · 246점');
  });

  it('stamps the daily board with its number so two cards can be compared', () => {
    expect(buildShareCard({ ...base, dailyNumber: 225 })).toContain('TouchCatch #225 · 속담');
    // A free-play stage is nobody else's board, so it is labelled by stage instead.
    expect(buildShareCard(base)).toContain('TouchCatch · 속담 2');
  });

  it('reports hints only when some were spent', () => {
    expect(buildShareCard(base)).not.toContain('힌트');
    expect(buildShareCard({ ...base, hintsUsed: 2 })).toContain('· 힌트 2');
  });

  it('says nothing about the answer', () => {
    // The whole point of a shareable result is that it does not spoil the puzzle. The
    // builder takes no answer-bearing parameter, and this guards the property directly.
    const card = buildShareCard({ ...base, category: 'PROVERB' });
    for (const leak of ['백문이', '불여일견', 'ㅂㅁㅇ', '_', 'resilience']) {
      expect(card).not.toContain(leak);
    }
  });

  it('clamps counts that do not fit the board', () => {
    expect(buildShareGrid({ ...base, foundCount: 99 })).toBe('🔍🔍🔍🔍🔍🔍🔍🔍🔍🔍');
    expect(buildShareGrid({ ...base, foundCount: -5 })).toBe('⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜');
    expect(buildShareGrid({ ...base, totalDifferences: 0, wordHuntCount: 0 })).toBe('');
  });

  it('does not claim a win that did not happen', () => {
    expect(buildShareCard({ ...base, solved: false })).toContain('⏹ 미완료');
    expect(buildShareCard({ ...base, solved: false })).not.toContain('정답');
  });
});
