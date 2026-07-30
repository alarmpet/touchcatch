import type { HintStepV1 } from '../../contracts/src/content.js';
import { containsDisallowedControl } from '../../contracts/src/answer-normalization.js';

export type HintCategory = 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';
export type HintLanguage = 'ko' | 'en' | 'ja' | 'es';

export type HintLadderValidationContext = Readonly<{
  reviewedHanja?: string;
  hanjaReviewStatus?: 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
  meaning?: Readonly<{
    options: readonly Readonly<{ id: string; label: string }>[];
    correctOptionId: string;
  }>;
}>;

export type SegmentedAnswer = Readonly<{
  hintUnits: readonly string[];
  revealableIndexes: readonly number[];
}>;

const SEPARATOR = /^[\p{White_Space}\p{Punctuation}]+$/u;
const HANJA = /\p{Script=Han}/u;
const INITIAL_CONSONANTS = [
  'ㄱ',
  'ㄲ',
  'ㄴ',
  'ㄷ',
  'ㄸ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅃ',
  'ㅅ',
  'ㅆ',
  'ㅇ',
  'ㅈ',
  'ㅉ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
] as const;

export function segmentAnswer(answer: string, language: HintLanguage): SegmentedAnswer {
  const hintUnits = [
    ...new Intl.Segmenter(language, { granularity: 'grapheme' }).segment(answer),
  ].map(({ segment }) => segment);
  const revealableIndexes = hintUnits.flatMap((unit, index) =>
    SEPARATOR.test(unit) ? [] : [index],
  );

  return { hintUnits, revealableIndexes };
}

function addError(errors: string[], code: string): void {
  if (!errors.includes(code)) errors.push(code);
}

function containsCanonicalAnswer(text: string, answer: string): boolean {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .includes(answer.normalize('NFKC').toLocaleLowerCase());
}

function initialConsonant(grapheme: string): string | undefined {
  const codePoint = grapheme.codePointAt(0);
  if (codePoint === undefined || codePoint < 0xac00 || codePoint > 0xd7a3) return undefined;
  return INITIAL_CONSONANTS[Math.floor((codePoint - 0xac00) / 588)];
}

function initialPattern(answer: SegmentedAnswer): string | undefined {
  const initials = answer.revealableIndexes.map((index) => initialConsonant(answer.hintUnits[index]!));
  return initials.every((initial): initial is string => initial !== undefined)
    ? initials.join('')
    : undefined;
}

function authoredInitials(value: string): string {
  return [...value].filter((character) => /[ㄱ-ㅎ]/u.test(character)).join('');
}

function hasExactlyOneBlank(value: string): boolean {
  return (value.match(/_{2,}|＿{2,}|□+/gu) ?? []).length === 1;
}

function sameIndexes(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function alternatingIndexes(indexes: readonly number[]): number[] {
  const alternating = indexes.filter((_, index) => index % 2 === 0);
  return alternating.length === indexes.length ? alternating.slice(0, -1) : alternating;
}

function stepAt(steps: readonly HintStepV1[], ordinal: HintStepV1['ordinal']): HintStepV1 | undefined {
  return steps.find((step) => step.ordinal === ordinal);
}

function validateOrdinals(errors: string[], steps: readonly HintStepV1[]): void {
  if (steps.length !== 5) addError(errors, 'HINT_STEP_COUNT');
  const ordinals = steps.map((step) => step.ordinal);
  if (new Set(ordinals).size !== ordinals.length) addError(errors, 'DUPLICATE_ORDINAL');
  for (const ordinal of [1, 2, 3, 4, 5] as const) {
    if (!ordinals.includes(ordinal)) addError(errors, 'MISSING_ORDINAL');
  }
  if (steps.some((step, index) => step.ordinal !== index + 1)) {
    addError(errors, 'HINT_ORDINAL_ORDER');
  }
}

function validateLocalization(
  errors: string[],
  answer: string,
  steps: readonly HintStepV1[],
): void {
  for (const step of steps) {
    const localized = step.localizedText as Partial<Record<'ko' | 'en', unknown>>;
    for (const language of ['ko', 'en'] as const) {
      const value = localized?.[language];
      if (typeof value !== 'string' || value.trim().length === 0) {
        addError(errors, 'MISSING_HINT_LOCALIZATION');
        continue;
      }
      if (containsDisallowedControl(value)) addError(errors, 'HINT_CONTROL_CHARACTER');
      if (step.ordinal < 5 && containsCanonicalAnswer(value, answer)) {
        addError(errors, 'FULL_ANSWER_DISCLOSURE');
      }
    }
  }
}

function validateKinds(
  errors: string[],
  category: HintCategory,
  steps: readonly HintStepV1[],
): void {
  const kinds = ([1, 2, 3, 4, 5] as const).map((ordinal) => stepAt(steps, ordinal)?.kind);
  const exact = (expected: readonly (HintStepV1['kind'] | readonly HintStepV1['kind'][])[]) =>
    expected.every((kind, index) => {
      const actual = kinds[index];
      return Array.isArray(kind) ? kind.includes(actual!) : actual === kind;
    });

  const valid =
    category === 'ENGLISH'
      ? exact([
          ['SEMANTIC_CATEGORY', 'DEFINITION'],
          'CONTEXT_SENTENCE',
          'ANSWER_LENGTH',
          'REVEAL_GRAPHEME',
          'REVEAL_GRAPHEME',
        ])
      : category === 'PROVERB' || category === 'IDIOM'
        ? exact([
            'CONTEXT_SENTENCE',
            'DEFINITION',
            'INITIAL_PATTERN',
            'REVEAL_GRAPHEME',
            'REVEAL_GRAPHEME',
          ])
        : exact([
            'SEMANTIC_CATEGORY',
            'DEFINITION',
            'ELIMINATE_OPTION',
            ['ANSWER_LENGTH', 'REVEAL_GRAPHEME'],
            'ELIMINATE_OPTION',
          ]);

  if (!valid) addError(errors, 'INVALID_HINT_KIND_SEQUENCE');
}

function validateRevealIndexes(
  errors: string[],
  segmented: SegmentedAnswer,
  steps: readonly HintStepV1[],
): void {
  const revealable = new Set(segmented.revealableIndexes);
  const alreadyRevealed = new Set<number>();

  for (const step of [...steps].sort((left, right) => left.ordinal - right.ordinal)) {
    const withinStep = new Set<number>();
    for (const index of step.revealIndexes) {
      if (!Number.isInteger(index) || index < 0) {
        addError(errors, 'NON_GRAPHEME_INDEX');
        continue;
      }
      if (withinStep.has(index)) addError(errors, 'DUPLICATE_REVEAL_INDEX');
      withinStep.add(index);

      if (step.kind === 'ELIMINATE_OPTION') continue;
      if (!revealable.has(index)) addError(errors, 'NON_GRAPHEME_INDEX');
      if (alreadyRevealed.has(index)) addError(errors, 'DUPLICATE_REVEAL_INDEX');
      alreadyRevealed.add(index);
    }

    if (
      step.kind !== 'REVEAL_GRAPHEME' &&
      step.kind !== 'ELIMINATE_OPTION' &&
      step.revealIndexes.length > 0
    ) {
      addError(errors, 'UNEXPECTED_REVEAL_INDEX');
    }
    if (
      step.ordinal < 5 &&
      segmented.revealableIndexes.length > 0 &&
      segmented.revealableIndexes.every((index) => alreadyRevealed.has(index))
    ) {
      addError(errors, 'FULL_ANSWER_DISCLOSURE');
    }
  }
}

function validateEnglish(
  errors: string[],
  segmented: SegmentedAnswer,
  steps: readonly HintStepV1[],
): void {
  const context = stepAt(steps, 2);
  if (
    !context ||
    !(['ko', 'en'] as const).every((language) => {
      const value = context.localizedText?.[language];
      return typeof value === 'string' && hasExactlyOneBlank(value);
    })
  ) {
    addError(errors, 'ENGLISH_CONTEXT_BLANK');
  }

  const lengthStep = stepAt(steps, 3);
  if (
    !lengthStep ||
    !(['ko', 'en'] as const).every((language) =>
      lengthStep.localizedText?.[language]?.includes(String(segmented.revealableIndexes.length)),
    )
  ) {
    addError(errors, 'ANSWER_LENGTH_MISMATCH');
  }

  const fourth = stepAt(steps, 4);
  const fifth = stepAt(steps, 5);
  const revealable = segmented.revealableIndexes;
  const deterministic =
    revealable.length >= 5
      ? revealable[0]
      : revealable[Math.floor(revealable.length / 2)];
  if (deterministic === undefined || !fourth || !sameIndexes(fourth.revealIndexes, [deterministic])) {
    addError(errors, 'ENGLISH_DETERMINISTIC_REVEAL');
  }

  const remaining = revealable.filter((index) => index !== deterministic);
  if (!fifth || !sameIndexes(fifth.revealIndexes, alternatingIndexes(remaining))) {
    addError(errors, 'ENGLISH_ALTERNATING_REVEAL');
  }

  const revealedBeforeFive = new Set(
    steps.filter((step) => step.ordinal < 5).flatMap((step) => [...step.revealIndexes]),
  );
  if (
    revealable.length <= 4 &&
    revealable.length > 0 &&
    revealedBeforeFive.has(revealable[0]!) &&
    revealedBeforeFive.has(revealable.at(-1)!)
  ) {
    addError(errors, 'SHORT_ENGLISH_PREMATURE_DISCLOSURE');
  }

  const allRevealed = new Set(
    steps.filter((step) => step.kind === 'REVEAL_GRAPHEME').flatMap((step) => [...step.revealIndexes]),
  );
  if (revealable.length > 0 && revealable.every((index) => allRevealed.has(index))) {
    addError(errors, 'FINAL_HINT_MUST_RETAIN_BLANK');
  }
}

function validateInitials(
  errors: string[],
  segmented: SegmentedAnswer,
  steps: readonly HintStepV1[],
): void {
  const expected = initialPattern(segmented);
  const step = stepAt(steps, 3);
  if (
    !expected ||
    !step ||
    !(['ko', 'en'] as const).every(
      (language) => authoredInitials(step.localizedText?.[language] ?? '') === expected,
    )
  ) {
    addError(errors, 'INITIAL_PATTERN_MISMATCH');
  }
}

function validateProverb(
  errors: string[],
  segmented: SegmentedAnswer,
  steps: readonly HintStepV1[],
): void {
  validateInitials(errors, segmented, steps);
  const fourth = stepAt(steps, 4);
  const fifth = stepAt(steps, 5);
  if (!fourth || fourth.revealIndexes.length !== 1) addError(errors, 'PROVERB_ONE_SYLLABLE');
  const remaining = segmented.revealableIndexes.filter(
    (index) => !fourth?.revealIndexes.includes(index),
  );
  if (!fifth || !sameIndexes(fifth.revealIndexes, alternatingIndexes(remaining))) {
    addError(errors, 'PROVERB_ALTERNATING_REVEAL');
  }
  const revealed = new Set(
    steps.filter((step) => step.kind === 'REVEAL_GRAPHEME').flatMap((step) => [...step.revealIndexes]),
  );
  if (segmented.revealableIndexes.every((index) => revealed.has(index))) {
    addError(errors, 'FINAL_HINT_MUST_RETAIN_BLANK');
  }
}

function validateIdiom(
  errors: string[],
  segmented: SegmentedAnswer,
  steps: readonly HintStepV1[],
  context: HintLadderValidationContext,
): void {
  validateInitials(errors, segmented, steps);
  if (segmented.revealableIndexes.length !== 4) addError(errors, 'IDIOM_ANSWER_LENGTH');
  if (stepAt(steps, 4)?.revealIndexes.length !== 1) addError(errors, 'IDIOM_ONE_SYLLABLE');
  if (stepAt(steps, 5)?.revealIndexes.length !== 2) addError(errors, 'IDIOM_TWO_SYLLABLES');

  const localizedText = steps.flatMap((step) => [
    step.localizedText?.ko ?? '',
    step.localizedText?.en ?? '',
  ]);
  if (localizedText.some((value) => HANJA.test(value))) {
    const reviewedCharacters = new Set([...(context.reviewedHanja ?? '')]);
    const authoredCharacters = localizedText.flatMap((value) =>
      [...value].filter((character) => HANJA.test(character)),
    );
    if (
      context.hanjaReviewStatus !== 'APPROVED' ||
      !context.reviewedHanja ||
      authoredCharacters.some((character) => !reviewedCharacters.has(character))
    ) {
      addError(errors, 'UNREVIEWED_HANJA');
    }
  }
}

function validateAnswerLengthStep(
  errors: string[],
  step: HintStepV1,
  graphemeCount: number,
): void {
  if (
    !(['ko', 'en'] as const).every((language) =>
      step.localizedText?.[language]?.includes(String(graphemeCount)),
    )
  ) {
    addError(errors, 'ANSWER_LENGTH_MISMATCH');
  }
}

function validateGeneralKnowledge(
  errors: string[],
  answer: string,
  segmented: SegmentedAnswer,
  steps: readonly HintStepV1[],
  context: HintLadderValidationContext,
): void {
  const fact = stepAt(steps, 2);
  if (
    fact &&
    (containsCanonicalAnswer(fact.localizedText?.ko ?? '', answer) ||
      containsCanonicalAnswer(fact.localizedText?.en ?? '', answer))
  ) {
    addError(errors, 'GENERAL_KNOWLEDGE_FACT_DISCLOSES_ANSWER');
  }

  const fourth = stepAt(steps, 4);
  if (fourth?.kind === 'ANSWER_LENGTH') {
    validateAnswerLengthStep(errors, fourth, segmented.revealableIndexes.length);
  } else if (
    fourth?.kind === 'REVEAL_GRAPHEME' &&
    !sameIndexes(fourth.revealIndexes, segmented.revealableIndexes.slice(0, 1))
  ) {
    addError(errors, 'GENERAL_KNOWLEDGE_FIRST_GRAPHEME');
  }

  const meaning = context.meaning;
  if (!meaning) {
    addError(errors, 'MISSING_MEANING_OPTIONS');
    return;
  }

  const correctIndex = meaning.options.findIndex((option) => option.id === meaning.correctOptionId);
  if (correctIndex < 0) {
    addError(errors, 'MISSING_CORRECT_OPTION');
    return;
  }

  const eliminated = new Set<number>();
  for (const ordinal of [3, 5] as const) {
    const indexes = stepAt(steps, ordinal)?.revealIndexes ?? [];
    if (indexes.length !== 1) addError(errors, 'ELIMINATE_OPTION_CARDINALITY');
    for (const index of indexes) {
      if (!Number.isInteger(index) || index < 0 || index >= meaning.options.length) {
        addError(errors, 'INVALID_OPTION_INDEX');
      } else if (index === correctIndex) {
        addError(errors, 'ELIMINATES_CORRECT_OPTION');
      } else if (eliminated.has(index)) {
        addError(errors, 'DUPLICATE_OPTION_ELIMINATION');
      } else {
        eliminated.add(index);
      }
    }
  }

  const wrongOptionCount = meaning.options.length - 1;
  if (wrongOptionCount - eliminated.size < 1) addError(errors, 'NO_WRONG_OPTION_REMAINS');
}

export function validateHintLadder(
  category: HintCategory,
  answer: string,
  steps: readonly HintStepV1[],
  context: HintLadderValidationContext = {},
): string[] {
  const errors: string[] = [];
  const language: HintLanguage = category === 'ENGLISH' || category === 'GENERAL_KNOWLEDGE' ? 'en' : 'ko';
  const segmented = segmentAnswer(answer, language);

  validateOrdinals(errors, steps);
  validateLocalization(errors, answer, steps);
  validateKinds(errors, category, steps);
  validateRevealIndexes(errors, segmented, steps);

  if (category === 'ENGLISH') validateEnglish(errors, segmented, steps);
  if (category === 'PROVERB') validateProverb(errors, segmented, steps);
  if (category === 'IDIOM') validateIdiom(errors, segmented, steps, context);
  if (category === 'GENERAL_KNOWLEDGE') {
    validateGeneralKnowledge(errors, answer, segmented, steps, context);
  }

  return errors;
}
