import { normalizeFinalAnswer } from '../../../../../packages/contracts/src/answer-normalization';

export type AnswerInputSurface = 'MULTIPLE_CHOICE' | 'FREE_TEXT' | 'PATTERN_ASSISTED';
export type LearningCategory = 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';

export type AnswerSubmission = Readonly<{
  category: LearningCategory;
  surface: AnswerInputSurface;
  rawAnswer: string;
  expectedAnswer?: string;
}>;

export type AnswerResult = Readonly<{
  normalizedAnswer: string;
  correct: boolean | null;
  penaltyUnits: number;
}>;

const HANGUL_INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];

export function buildAnswerPattern(category: LearningCategory, answer: string): string {
  if (category === 'ENGLISH') {
    return [...answer.trim().toLowerCase()]
      .map((character, index) => character === ' ' ? ' ' : index === 0 ? character : '_')
      .join(' ')
      .replace(/\s{3,}/g, '  ');
  }

  return [...answer].map((character) => {
    if (character === ' ') return ' ';
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint >= 0xAC00 && codePoint <= 0xD7A3) {
      return HANGUL_INITIALS[Math.floor((codePoint - 0xAC00) / 588)] ?? '_';
    }
    return /[A-Za-z0-9]/.test(character) ? character[0]!.toLowerCase() : '_';
  }).join('');
}

export function evaluatePreviewAnswer(submission: AnswerSubmission): AnswerResult {
  const normalizedAnswer = normalizeFinalAnswer(submission.rawAnswer);
  if (submission.surface === 'MULTIPLE_CHOICE' && !submission.expectedAnswer) {
    return { normalizedAnswer, correct: null, penaltyUnits: 0 };
  }
  const expected = submission.expectedAnswer === undefined ? undefined : normalizeFinalAnswer(submission.expectedAnswer);
  return {
    normalizedAnswer,
    correct: expected === undefined ? null : normalizedAnswer === expected,
    penaltyUnits: submission.surface === 'PATTERN_ASSISTED' ? 1 : 0,
  };
}
