import fs from 'fs';
import path from 'path';

type EnglishHintData = {
  key: string;
  filename: string;
  koCategory: string;
  enCategory: string;
  sentenceKo: string;
  sentenceEn: string;
  firstGraphemeIndex: number;
  revealIndexesStep5: number[];
};

const ENGLISH_BATCH: EnglishHintData[] = [
  {
    key: 'en-3d-creativity',
    filename: 'en-3d-creativity.json',
    koCategory: '새로운 아이디어를 만들어 내는 능력',
    enCategory: 'Ability to produce original ideas',
    sentenceKo: '그의 독창적인 아이디어는 남다른 ____에서 비롯되었어요.',
    sentenceEn: 'His original ideas stemmed from remarkable ____.',
    firstGraphemeIndex: 0,
    revealIndexesStep5: [1, 3, 5, 7, 9],
  },
  {
    key: 'en-3d-harmony',
    filename: 'en-3d-harmony.json',
    koCategory: '서로 잘 어우러지는 조화',
    enCategory: 'State of being in agreement or concord',
    sentenceKo: '오케스트라 단원들은 완벽한 ____를 이루어 연주했어요.',
    sentenceEn: 'The orchestra played in perfect ____.',
    firstGraphemeIndex: 0,
    revealIndexesStep5: [1, 3, 5],
  },
  {
    key: 'en-3d-serenity',
    filename: 'en-3d-serenity.json',
    koCategory: '마음의 평온함과 조용함',
    enCategory: 'State of being calm and peaceful',
    sentenceKo: '고요한 호수 풍경은 마음에 깊은 ____를 주었어요.',
    sentenceEn: 'The quiet lake view gave a sense of deep ____.',
    firstGraphemeIndex: 0,
    revealIndexesStep5: [1, 3, 5, 7],
  },
  {
    key: 'en-architecture-studio',
    filename: 'en-architecture-studio.json',
    koCategory: '건축물이나 구조를 설계하는 학문 및 기술',
    enCategory: 'Art or science of designing buildings',
    sentenceKo: '이 도시는 고대와 현대의 ____가 잘 어우러져 있어요.',
    sentenceEn: 'The city features a blend of ancient and modern ____.',
    firstGraphemeIndex: 0,
    revealIndexesStep5: [1, 3, 5, 7, 9, 11],
  },
];

type ProverbHintData = {
  key: string;
  filename: string;
  situationKo: string;
  situationEn: string;
  lessonKo: string;
  lessonEn: string;
  initials: string;
  firstIndex: number;
  step5Indexes: number[];
};

const PROVERB_BATCH: ProverbHintData[] = [
  {
    key: 'ko-proverb-cow-barn',
    filename: 'ko-proverb-cow-barn.json',
    situationKo: '이미 일을 그르친 후에 뒤늦게 대책을 세우는 상황에 써요.',
    situationEn: 'Used when taking precautions only after trouble has occurred.',
    lessonKo: '사전에 미리 대비하는 자세가 중요하다는 교훈이에요.',
    lessonEn: 'Lesson that prevention beforehand is crucial.',
    initials: 'ㅅ ㅇㄱ ㅇㅇㄱ ㄱㅊㄷ',
    firstIndex: 0,
    step5Indexes: [2, 4, 7, 9],
  },
  {
    key: 'ko-proverb-dark-under-lamp',
    filename: 'ko-proverb-dark-under-lamp.json',
    situationKo: '가까운 곳에서 일어나는 일을 오히려 모를 때 써요.',
    situationEn: 'Used when overlooking things right in front of you.',
    lessonKo: '가까이 있는 정황을 더 주의 깊게 살펴야 한다는 교훈이에요.',
    lessonEn: 'Lesson to pay attention to immediate surroundings.',
    initials: 'ㄷㅈ ㅁㅇ ㅇㄷㄷ',
    firstIndex: 0,
    step5Indexes: [1, 3, 5],
  },
  {
    key: 'ko-proverb-frog-well',
    filename: 'ko-proverb-frog-well.json',
    situationKo: '넓은 세상을 알지 못하고 견문이 좁은 사람을 비유할 때 써요.',
    situationEn: 'Used for a person with narrow perspective and limited experience.',
    lessonKo: '더 넓은 안목과 경험을 넓혀야 한다는 교훈이에요.',
    lessonEn: 'Lesson to broaden ones horizons and perspective.',
    initials: 'ㅇㅁ ㅇ ㄱㄱㄹ',
    firstIndex: 0,
    step5Indexes: [1, 4, 6],
  },
  {
    key: 'ko-proverb-kind-words-return',
    filename: 'ko-proverb-kind-words-return.json',
    situationKo: '내가 먼저 남에게 좋게 대해야 남도 나에게 좋게 대한다는 상황에 써요.',
    situationEn: 'Used when good words to others invite good words in return.',
    lessonKo: '타인을 대할 때 말과 행동을 긍정적으로 해야 한다는 교훈이에요.',
    lessonEn: 'Lesson that respectful words lead to respectful responses.',
    initials: 'ㄱㄴ ㅁㅇ ㄱㅇㅇ ㅇㄴ ㅁㅇ ㄱㄷ',
    firstIndex: 0,
    step5Indexes: [2, 5, 8, 11, 14],
  },
];

function main() {
  const draftsDir = path.join(process.cwd(), 'content/learning/drafts');
  const catalogPath = path.join(process.cwd(), 'content/learning/catalog.v1.json');
  const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));

  const catalogEntryMap = new Map<string, any>();
  for (const entry of catalogData.entries) {
    catalogEntryMap.set(entry.key, entry);
  }

  // 1. Process English Batch
  for (const item of ENGLISH_BATCH) {
    const draftPath = path.join(draftsDir, item.filename);
    if (!fs.existsSync(draftPath)) continue;

    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
    const fc = draft.privateSolution?.finalChallenge;
    if (!fc) continue;

    const hintLadder = [
      {
        ordinal: 1,
        kind: 'SEMANTIC_CATEGORY',
        localizedText: { ko: item.koCategory, en: item.enCategory },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 2,
        kind: 'CONTEXT_SENTENCE',
        localizedText: { ko: item.sentenceKo, en: item.sentenceEn },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 3,
        kind: 'ANSWER_LENGTH',
        localizedText: {
          ko: `정답은 ${fc.canonicalAnswer.length}글자예요.`,
          en: `The answer has ${fc.canonicalAnswer.length} graphemes.`,
        },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 4,
        kind: 'REVEAL_GRAPHEME',
        localizedText: { ko: '첫 글자를 공개해요.', en: 'Reveal the first grapheme.' },
        revealIndexes: [item.firstGraphemeIndex],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 5,
        kind: 'REVEAL_GRAPHEME',
        localizedText: { ko: '남은 글자를 번갈아 공개해요.', en: 'Reveal alternating unrevealed graphemes.' },
        revealIndexes: item.revealIndexesStep5,
        rankedPenaltyUnits: 1,
      },
    ];

    fc.hintLadder = hintLadder;
    fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2), 'utf-8');

    const catEntry = catalogEntryMap.get(item.key);
    if (catEntry) {
      catEntry.hintLadder = hintLadder;
    }
  }

  // 2. Process Proverb Batch
  for (const item of PROVERB_BATCH) {
    const draftPath = path.join(draftsDir, item.filename);
    if (!fs.existsSync(draftPath)) continue;

    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
    const fc = draft.privateSolution?.finalChallenge;
    if (!fc) continue;

    const hintLadder = [
      {
        ordinal: 1,
        kind: 'CONTEXT_SENTENCE',
        localizedText: { ko: item.situationKo, en: item.situationEn },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 2,
        kind: 'DEFINITION',
        localizedText: { ko: item.lessonKo, en: item.lessonEn },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 3,
        kind: 'INITIAL_PATTERN',
        localizedText: { ko: item.initials, en: item.initials },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 4,
        kind: 'REVEAL_GRAPHEME',
        localizedText: { ko: '한 음절을 공개해요.', en: 'Reveal one syllable.' },
        revealIndexes: [item.firstIndex],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 5,
        kind: 'REVEAL_GRAPHEME',
        localizedText: { ko: '남은 음절을 번갈아 공개해요.', en: 'Reveal alternating remaining syllables.' },
        revealIndexes: item.step5Indexes,
        rankedPenaltyUnits: 1,
      },
    ];

    fc.hintLadder = hintLadder;
    fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2), 'utf-8');

    const catEntry = catalogEntryMap.get(item.key);
    if (catEntry) {
      catEntry.hintLadder = hintLadder;
    }
  }

  fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2), 'utf-8');
  console.log('Successfully updated draft packs and catalog.v1.json for Ladder Batch-1.');
}

main();
