import { describe, expect, it } from 'vitest';
import { buildAnswerPattern, evaluatePreviewAnswer } from './answer-mode';

describe('evaluatePreviewAnswer', () => {
  it('uses the shared normalizer for English spelling', () => {
    expect(evaluatePreviewAnswer({ category: 'ENGLISH', surface: 'FREE_TEXT', rawAnswer: '  RESILIENCE  ', expectedAnswer: 'resilience' })).toEqual({ normalizedAnswer: 'resilience', correct: true, penaltyUnits: 0 });
  });

  it('normalizes Korean proverb spacing', () => {
    expect(evaluatePreviewAnswer({ category: 'PROVERB', surface: 'FREE_TEXT', rawAnswer: '백문이   불여일견', expectedAnswer: '백문이 불여일견' }).correct).toBe(true);
  });

  it('does not perform client judging without an expected answer', () => {
    expect(evaluatePreviewAnswer({ category: 'IDIOM', surface: 'PATTERN_ASSISTED', rawAnswer: '전화위복' })).toEqual({ normalizedAnswer: '전화위복', correct: null, penaltyUnits: 1 });
  });

  it('builds spelling and Korean initial-pattern hints without exposing the answer', () => {
    expect(buildAnswerPattern('ENGLISH', 'resilience')).toBe('r _ _ _ _ _ _ _ _ _');
    expect(buildAnswerPattern('PROVERB', '백문이 불여일견')).toBe('ㅂㅁㅇ ㅂㅇㅇㄱ');
    expect(buildAnswerPattern('IDIOM', '전화위복')).toBe('ㅈㅎㅇㅂ');
  });
});
