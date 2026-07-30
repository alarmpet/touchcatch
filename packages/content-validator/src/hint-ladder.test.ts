import { describe, expect, it } from 'vitest';
import {
  segmentAnswer,
  validateHintLadder,
  type HintLadderValidationContext,
} from './hint-ladder.js';

type Step = {
  ordinal: 1 | 2 | 3 | 4 | 5;
  kind:
    | 'VISUAL_REGION'
    | 'SEMANTIC_CATEGORY'
    | 'DEFINITION'
    | 'CONTEXT_SENTENCE'
    | 'ANSWER_LENGTH'
    | 'INITIAL_PATTERN'
    | 'REVEAL_GRAPHEME'
    | 'ELIMINATE_OPTION';
  localizedText: Readonly<Record<'ko' | 'en', string>>;
  revealIndexes: readonly number[];
  rankedPenaltyUnits: 1;
};

const text = (ko: string, en: string): Step['localizedText'] => ({ ko, en });

const englishSteps: readonly Step[] = [
  {
    ordinal: 1,
    kind: 'SEMANTIC_CATEGORY',
    localizedText: text('역경을 이겨 내는 힘을 나타내는 말이에요.', 'A quality for recovering from difficulty.'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 2,
    kind: 'CONTEXT_SENTENCE',
    localizedText: text(
      '공동체는 폭풍 뒤 놀라운 ____을 보여 주었어요.',
      'The community showed remarkable ____ after the storm.',
    ),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 3,
    kind: 'ANSWER_LENGTH',
    localizedText: text('정답은 10글자예요.', 'The answer has 10 graphemes.'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 4,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('첫 글자를 공개해요.', 'Reveal the first grapheme.'),
    revealIndexes: [0],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 5,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('남은 글자를 번갈아 공개해요.', 'Reveal alternating unrevealed graphemes.'),
    revealIndexes: [1, 3, 5, 7, 9],
    rankedPenaltyUnits: 1,
  },
];

const shortEnglishSteps: readonly Step[] = [
  {
    ordinal: 1,
    kind: 'DEFINITION',
    localizedText: text('읽기 위해 묶은 종이예요.', 'Bound pages that people read.'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 2,
    kind: 'CONTEXT_SENTENCE',
    localizedText: text('도서관에서 ____을 빌렸어요.', 'I borrowed a ____ from the library.'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 3,
    kind: 'ANSWER_LENGTH',
    localizedText: text('정답은 4글자예요.', 'The answer has 4 graphemes.'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 4,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('가운데 글자를 공개해요.', 'Reveal a deterministic internal grapheme.'),
    revealIndexes: [2],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 5,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('남은 글자를 번갈아 공개해요.', 'Reveal alternating unrevealed graphemes.'),
    revealIndexes: [0, 3],
    rankedPenaltyUnits: 1,
  },
];

const proverbSteps: readonly Step[] = [
  {
    ordinal: 1,
    kind: 'CONTEXT_SENTENCE',
    localizedText: text(
      '설명을 여러 번 듣기보다 직접 한 번 확인하는 편이 나은 상황에 써요.',
      'Use it when seeing something once is better than hearing repeated explanations.',
    ),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 2,
    kind: 'DEFINITION',
    localizedText: text(
      '직접 경험하고 확인하는 일이 중요하다는 교훈이에요.',
      'The lesson values direct observation and experience.',
    ),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 3,
    kind: 'INITIAL_PATTERN',
    localizedText: text('ㅂㅁㅇ ㅂㅇㅇㄱ', 'ㅂㅁㅇ ㅂㅇㅇㄱ'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 4,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('한 음절을 공개해요.', 'Reveal one syllable.'),
    revealIndexes: [0],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 5,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('남은 음절을 번갈아 공개해요.', 'Reveal alternating remaining syllables.'),
    revealIndexes: [1, 4, 6],
    rankedPenaltyUnits: 1,
  },
];

const idiomSteps: readonly Step[] = [
  {
    ordinal: 1,
    kind: 'CONTEXT_SENTENCE',
    localizedText: text(
      '실패한 실험을 분석해 더 좋은 발명으로 바꾼 상황에 어울려요.',
      'It fits turning a failed experiment into a better invention.',
    ),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 2,
    kind: 'DEFINITION',
    localizedText: text(
      '나쁜 일이 계기가 되어 좋은 결과로 바뀐다는 뜻이에요.',
      'A misfortune becomes the cause of a fortunate result.',
    ),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 3,
    kind: 'INITIAL_PATTERN',
    localizedText: text('ㅈㅎㅇㅂ', 'ㅈㅎㅇㅂ'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 4,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('한 음절을 공개해요.', 'Reveal one syllable.'),
    revealIndexes: [0],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 5,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('두 음절을 더 공개해요.', 'Reveal two more syllables.'),
    revealIndexes: [1, 2],
    rankedPenaltyUnits: 1,
  },
];

const generalKnowledgeSteps: readonly Step[] = [
  {
    ordinal: 1,
    kind: 'SEMANTIC_CATEGORY',
    localizedText: text('태양계 행성 분야예요.', 'The domain is Solar System planets.'),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 2,
    kind: 'DEFINITION',
    localizedText: text(
      '표면의 산화철 때문에 붉게 보여요.',
      'Iron oxide on its surface gives it a reddish appearance.',
    ),
    revealIndexes: [],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 3,
    kind: 'ELIMINATE_OPTION',
    localizedText: text('두 번째 선택지는 아니에요.', 'Eliminate the second option.'),
    revealIndexes: [1],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 4,
    kind: 'REVEAL_GRAPHEME',
    localizedText: text('첫 글자를 공개해요.', 'Reveal the first grapheme.'),
    revealIndexes: [0],
    rankedPenaltyUnits: 1,
  },
  {
    ordinal: 5,
    kind: 'ELIMINATE_OPTION',
    localizedText: text('세 번째 선택지도 아니에요.', 'Eliminate the third option.'),
    revealIndexes: [2],
    rankedPenaltyUnits: 1,
  },
];

const generalKnowledgeContext: HintLadderValidationContext = {
  meaning: {
    options: [
      { id: 'mars', label: 'Mars' },
      { id: 'venus', label: 'Venus' },
      { id: 'jupiter', label: 'Jupiter' },
      { id: 'saturn', label: 'Saturn' },
    ],
    correctOptionId: 'mars',
  },
};

describe('category-specific hint ladder admission', () => {
  it('accepts the authored English sequence', () => {
    expect(validateHintLadder('ENGLISH', 'resilience', englishSteps)).toEqual([]);
  });

  it('rejects first-and-last disclosure for a short English answer before step five', () => {
    const revealsFirstAndLastEarly = shortEnglishSteps.map((step) =>
      step.ordinal === 4 ? { ...step, revealIndexes: [0, 3] } : step,
    );

    expect(validateHintLadder('ENGLISH', 'book', revealsFirstAndLastEarly)).toContain(
      'SHORT_ENGLISH_PREMATURE_DISCLOSURE',
    );
  });

  it('requires exactly one context blank for English', () => {
    const missingContext = englishSteps.map((step) =>
      step.ordinal === 2
        ? {
            ...step,
            localizedText: text(
              '공동체는 폭풍 뒤 놀라운 힘을 보여 주었어요.',
              'The community showed remarkable strength after the storm.',
            ),
          }
        : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', missingContext)).toContain(
      'ENGLISH_CONTEXT_BLANK',
    );
  });

  it('accepts the authored Korean proverb sequence', () => {
    expect(validateHintLadder('PROVERB', '백문이 불여일견', proverbSteps)).toEqual([]);
  });

  it('rejects a proverb initial pattern that does not match the canonical answer', () => {
    const invalidInitials = proverbSteps.map((step) =>
      step.ordinal === 3 ? { ...step, localizedText: text('ㄱㄴㄷ ㄹㅁㅂㅅ', 'ㄱㄴㄷ ㄹㅁㅂㅅ') } : step,
    );

    expect(validateHintLadder('PROVERB', '백문이 불여일견', invalidInitials)).toContain(
      'INITIAL_PATTERN_MISMATCH',
    );
  });

  it('accepts the authored Korean idiom sequence without inferred Hanja', () => {
    expect(validateHintLadder('IDIOM', '전화위복', idiomSteps)).toEqual([]);
  });

  it('rejects Hanja that has no approved reviewed-Hanja evidence', () => {
    const inferredHanjaSteps = idiomSteps.map((step) =>
      step.ordinal === 2
        ? {
            ...step,
            localizedText: text('轉禍爲福은 나쁜 일이 좋은 결과로 바뀐다는 뜻이에요.', '轉禍爲福 means fortune from trouble.'),
          }
        : step,
    );

    expect(validateHintLadder('IDIOM', '전화위복', inferredHanjaSteps)).toContain(
      'UNREVIEWED_HANJA',
    );
    expect(
      validateHintLadder('IDIOM', '전화위복', inferredHanjaSteps, {
        reviewedHanja: '轉禍爲福',
        hanjaReviewStatus: 'APPROVED',
      }),
    ).toEqual([]);
  });

  it('accepts the general-knowledge sequence with two safe option eliminations', () => {
    expect(
      validateHintLadder(
        'GENERAL_KNOWLEDGE',
        'Mars',
        generalKnowledgeSteps,
        generalKnowledgeContext,
      ),
    ).toEqual([]);
  });

  it.each([
    {
      name: 'the correct option',
      expected: 'ELIMINATES_CORRECT_OPTION',
      steps: generalKnowledgeSteps.map((step) =>
        step.ordinal === 3 ? { ...step, revealIndexes: [0] } : step,
      ),
    },
    {
      name: 'the same option twice',
      expected: 'DUPLICATE_OPTION_ELIMINATION',
      steps: generalKnowledgeSteps.map((step) =>
        step.ordinal === 5 ? { ...step, revealIndexes: [1] } : step,
      ),
    },
  ])('rejects eliminating $name', ({ steps, expected }) => {
    expect(
      validateHintLadder('GENERAL_KNOWLEDGE', 'Mars', steps, generalKnowledgeContext),
    ).toContain(expected);
  });

  it('rejects eliminations that leave no wrong option visible', () => {
    const onlyTwoWrongOptions: HintLadderValidationContext = {
      meaning: {
        options: generalKnowledgeContext.meaning!.options.slice(0, 3),
        correctOptionId: 'mars',
      },
    };

    expect(
      validateHintLadder(
        'GENERAL_KNOWLEDGE',
        'Mars',
        generalKnowledgeSteps,
        onlyTwoWrongOptions,
      ),
    ).toContain('NO_WRONG_OPTION_REMAINS');
  });

  it('rejects a non-unit ranked penalty even when raw input bypasses the schema', () => {
    const invalidPenalty = englishSteps.map((step) =>
      step.ordinal === 1
        ? { ...step, rankedPenaltyUnits: 2 as unknown as 1 }
        : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', invalidPenalty)).toContain(
      'INVALID_RANKED_PENALTY',
    );
  });

  it('matches answer-length tokens exactly rather than accepting 4 inside 14', () => {
    const misleading = generalKnowledgeSteps.map((step) =>
      step.ordinal === 4
        ? {
            ...step,
            kind: 'ANSWER_LENGTH' as const,
            revealIndexes: [],
            localizedText: text('14湲???뺣떟?댁슂.', 'The answer has 14 graphemes.'),
          }
        : step,
    );

    expect(
      validateHintLadder(
        'GENERAL_KNOWLEDGE',
        'Mars',
        misleading.map((step) =>
          step.ordinal === 4
            ? {
                ...step,
                localizedText: text(
                  'The answer has 14 graphemes.',
                  'The answer has 14 graphemes.',
                ),
              }
            : step,
        ),
        generalKnowledgeContext,
      ),
    ).toContain('ANSWER_LENGTH_MISMATCH');
  });

  it('requires an exact approved reviewed Hanja run in every category', () => {
    const withReorderedHanja = englishSteps.map((step) =>
      step.ordinal === 1
        ? {
            ...step,
            localizedText: text('福轉禍爲 ?곗뼱?댁슂.', 'The reviewed gloss is 福轉禍爲.'),
          }
        : step,
    );

    expect(
      validateHintLadder('ENGLISH', 'resilience', withReorderedHanja, {
        reviewedHanja: '轉禍爲福',
        hanjaReviewStatus: 'APPROVED',
      }),
    ).toContain('UNREVIEWED_HANJA');
  });
});

describe('shared hint ladder safety', () => {
  it('preserves canonical graphemes while excluding visible separators from reveal units', () => {
    const segmented = segmentAnswer("rock'n-roll", 'en');

    expect(segmented.hintUnits.join('')).toBe("rock'n-roll");
    expect(segmented.revealableIndexes).toEqual([0, 1, 2, 3, 5, 7, 8, 9, 10]);
  });

  it('rejects a missing ordinal', () => {
    const missingOrdinal = englishSteps.map((step) =>
      step.ordinal === 5 ? { ...step, ordinal: 4 as const } : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', missingOrdinal)).toContain(
      'MISSING_ORDINAL',
    );
  });

  it('rejects a duplicate reveal index across hint steps', () => {
    const duplicateReveal = englishSteps.map((step) =>
      step.ordinal === 5 ? { ...step, revealIndexes: [0, 1, 3, 5, 7, 9] } : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', duplicateReveal)).toContain(
      'DUPLICATE_REVEAL_INDEX',
    );
  });

  it('rejects full-answer disclosure before step five', () => {
    const fullAnswerAtStepFour = englishSteps.map((step) =>
      step.ordinal === 4
        ? { ...step, revealIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }
        : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', fullAnswerAtStepFour)).toContain(
      'FULL_ANSWER_DISCLOSURE',
    );
  });

  it('rejects control characters in authored localization', () => {
    const controlCharacter = englishSteps.map((step) =>
      step.ordinal === 1
        ? { ...step, localizedText: text('잘못된\u0000힌트', 'Invalid hint') }
        : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', controlCharacter)).toContain(
      'HINT_CONTROL_CHARACTER',
    );
  });

  it('requires both Korean and English localization', () => {
    const missingEnglish = englishSteps.map((step) =>
      step.ordinal === 1
        ? {
            ...step,
            localizedText: { ko: step.localizedText.ko } as Step['localizedText'],
          }
        : step,
    );

    expect(validateHintLadder('ENGLISH', 'resilience', missingEnglish)).toContain(
      'MISSING_HINT_LOCALIZATION',
    );
  });

  it('rejects indexes that do not identify a revealable grapheme', () => {
    const pointsAtSpace = proverbSteps.map((step) =>
      step.ordinal === 4 ? { ...step, revealIndexes: [3] } : step,
    );

    expect(validateHintLadder('PROVERB', '백문이 불여일견', pointsAtSpace)).toContain(
      'NON_GRAPHEME_INDEX',
    );
  });
});
