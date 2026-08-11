import { describe, expect, it } from 'vitest';
import { initialAnswerState, reduceAnswerState } from './answer-controller';

describe('answer controller', () => {
  it('records normalized preview submissions and preserves hint count', () => {
    const state = reduceAnswerState(
      { ...initialAnswerState, hintsUsed: 2 },
      { type: 'SUBMIT', submission: { category: 'PROVERB', surface: 'FREE_TEXT', rawAnswer: ' 백문이  불여일견 ', expectedAnswer: '백문이 불여일견' } },
    );
    expect(state).toMatchObject({ submitted: true, hintsUsed: 2 });
    expect(state.lastResult).toMatchObject({ normalizedAnswer: '백문이 불여일견', correct: true });
  });

  it('increments hint usage and resets the whole interaction', () => {
    const hinted = reduceAnswerState(initialAnswerState, { type: 'REVEAL_HINT' });
    expect(hinted.hintsUsed).toBe(1);
    expect(reduceAnswerState(hinted, { type: 'RESET' })).toEqual(initialAnswerState);
  });
});
