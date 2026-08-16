import fs from 'fs';
import path from 'path';
import { canonicalJsonSha256 } from '../../packages/contracts/src/canonical-json.js';
import { alternatingIndexes, segmentAnswer } from '../../packages/content-validator/src/hint-ladder.js';

type EnglishHintData = {
  key: string;
  filename: string;
  koCategory: string;
  enCategory: string;
  sentenceKo: string;
  sentenceEn: string;
};

const ENGLISH_BATCH: EnglishHintData[] = [
  {
    key: 'en-3d-creativity',
    filename: 'en-3d-creativity.json',
    koCategory: '새로운 아이디어를 만들어 내는 능력',
    enCategory: 'Ability to produce original ideas',
    sentenceKo: '그의 독창적인 아이디어는 남다른 ____에서 비롯되었어요.',
    sentenceEn: 'His original ideas stemmed from remarkable ____.',
  },
  {
    key: 'en-3d-harmony',
    filename: 'en-3d-harmony.json',
    koCategory: '서로 잘 어우러지는 조화',
    enCategory: 'State of being in agreement or concord',
    sentenceKo: '오케스트라 단원들은 완벽한 ____를 이루어 연주했어요.',
    sentenceEn: 'The orchestra played in perfect ____.',
  },
  {
    key: 'en-3d-serenity',
    filename: 'en-3d-serenity.json',
    koCategory: '마음의 평온함과 조용함',
    enCategory: 'State of being calm and peaceful',
    sentenceKo: '고요한 호수 풍경은 마음에 깊은 ____를 주었어요.',
    sentenceEn: 'The quiet lake view gave a sense of deep ____.',
  },
  {
    key: 'en-architecture-studio',
    filename: 'en-architecture-studio.json',
    koCategory: '건축물이나 구조를 설계하는 학문 및 기술',
    enCategory: 'Art or science of designing buildings',
    sentenceKo: '이 도시는 고대와 현대의 ____가 잘 어우러져 있어요.',
    sentenceEn: 'The city features a blend of ancient and modern ____.',
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
  },
  {
    key: 'ko-proverb-dark-under-lamp',
    filename: 'ko-proverb-dark-under-lamp.json',
    situationKo: '가까운 곳에서 일어나는 일을 오히려 모를 때 써요.',
    situationEn: 'Used when overlooking things right in front of you.',
    lessonKo: '가까이 있는 정황을 더 주의 깊게 살펴야 한다는 교훈이에요.',
    lessonEn: 'Lesson to pay attention to immediate surroundings.',
    initials: 'ㄷㅈ ㅁㅇ ㅇㄷㄷ',
  },
  {
    key: 'ko-proverb-frog-well',
    filename: 'ko-proverb-frog-well.json',
    situationKo: '넓은 세상을 알지 못하고 견문이 좁은 사람을 비유할 때 써요.',
    situationEn: 'Used for a person with narrow perspective and limited experience.',
    lessonKo: '더 넓은 안목과 경험을 넓혀야 한다는 교훈이에요.',
    lessonEn: 'Lesson to broaden ones horizons and perspective.',
    initials: 'ㅇㅁ ㅇ ㄱㄱㄹ',
  },
  {
    key: 'ko-proverb-kind-words-return',
    filename: 'ko-proverb-kind-words-return.json',
    situationKo: '내가 먼저 남에게 좋게 대해야 남도 나에게 좋게 대한다는 상황에 써요.',
    situationEn: 'Used when good words to others invite good words in return.',
    lessonKo: '타인을 대할 때 말과 행동을 긍정적으로 해야 한다는 교훈이에요.',
    lessonEn: 'Lesson that respectful words lead to respectful responses.',
    initials: 'ㄱㄴ ㅁㅇ ㄱㅇㅇ ㅇㄴ ㅁㅇ ㄱㄷ',
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

  // Nothing reaches disk until every pack has been built. The first version wrote each
  // draft as it went and the catalogue only at the very end, so an interrupted run left
  // drafts carrying a ladder the catalogue knew nothing about, which admission rejects
  // as CATALOG_HINT_LADDER_MISSING. Staging makes the run all-or-nothing.
  const staged: Array<{ draftPath: string; draft: any }> = [];
  const skipped: string[] = [];

  function prepare(key: string, filename: string) {
    const entry = catalogEntryMap.get(key);
    // A draft with no catalogue entry can never be admitted, and writing a ladder into
    // one only produces an orphan for the drift check to warn about.
    if (!entry) return { skip: `${key}: not in catalog.v1.json` } as const;

    const draftPath = path.join(draftsDir, filename);
    if (!fs.existsSync(draftPath)) return { skip: `${key}: no draft file` } as const;

    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf-8'));
    const finalChallenge = draft.privateSolution?.finalChallenge;
    if (!finalChallenge) return { skip: `${key}: draft has no finalChallenge` } as const;

    const segmented = segmentAnswer(entry.canonicalAnswer, entry.language);
    if (segmented.revealableIndexes.length === 0) {
      return { skip: `${key}: answer has no revealable graphemes` } as const;
    }

    return { entry, draft, draftPath, finalChallenge, segmented } as const;
  }

  function commit(
    prepared: { entry: any; draft: any; draftPath: string; finalChallenge: any },
    hintLadder: unknown[],
  ) {
    prepared.finalChallenge.hintLadder = hintLadder;
    // Admission compares publicContent.category against the catalogue entry and
    // re-derives privateSolutionHash over the whole private body. Leaving either alone
    // rejects the pack even when the ladder itself is sound.
    prepared.draft.publicContent.category = prepared.entry.category;
    const { privateSolutionHash: _stale, ...privateBody } = prepared.draft.privateSolution;
    prepared.draft.privateSolution.privateSolutionHash = canonicalJsonSha256(privateBody);
    prepared.entry.hintLadder = hintLadder;
    staged.push({ draftPath: prepared.draftPath, draft: prepared.draft });
  }

  // 1. Process English Batch
  for (const item of ENGLISH_BATCH) {
    const prepared = prepare(item.key, item.filename);
    if ('skip' in prepared) {
      skipped.push(prepared.skip);
      continue;
    }

    // Both index sets come from the validator's own rule rather than a hand-authored
    // list, so a ladder cannot drift out of step with the segmentation. Hand-authored
    // numbers are what produced NON_GRAPHEME_INDEX on the first attempt.
    const revealable = prepared.segmented.revealableIndexes;
    const deterministic =
      revealable.length >= 5 ? revealable[0]! : revealable[Math.floor(revealable.length / 2)]!;
    const remaining = revealable.filter((index) => index !== deterministic);

    commit(prepared, [
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
        // The number the validator checks is the revealable grapheme count, which parts
        // company with the raw answer length as soon as a space or hyphen is in it.
        localizedText: {
          ko: `정답은 ${revealable.length}글자예요.`,
          en: `The answer has ${revealable.length} graphemes.`,
        },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 4,
        kind: 'REVEAL_GRAPHEME',
        // Short answers reveal from the middle instead of the front, so the copy has to
        // follow the index rather than assert "first" and be wrong.
        localizedText:
          deterministic === revealable[0]
            ? { ko: '첫 글자를 공개해요.', en: 'Reveal the first grapheme.' }
            : { ko: '글자 하나를 공개해요.', en: 'Reveal one grapheme.' },
        revealIndexes: [deterministic],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 5,
        kind: 'REVEAL_GRAPHEME',
        localizedText: {
          ko: '남은 글자를 번갈아 공개해요.',
          en: 'Reveal alternating unrevealed graphemes.',
        },
        revealIndexes: alternatingIndexes(remaining),
        rankedPenaltyUnits: 1,
      },
    ]);
  }

  // 2. Process Proverb Batch
  for (const item of PROVERB_BATCH) {
    const prepared = prepare(item.key, item.filename);
    if ('skip' in prepared) {
      skipped.push(prepared.skip);
      continue;
    }

    const revealable = prepared.segmented.revealableIndexes;
    const first = revealable[0]!;
    const remaining = revealable.filter((index) => index !== first);

    commit(prepared, [
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
        revealIndexes: [first],
        rankedPenaltyUnits: 1,
      },
      {
        ordinal: 5,
        kind: 'REVEAL_GRAPHEME',
        localizedText: {
          ko: '남은 음절을 번갈아 공개해요.',
          en: 'Reveal alternating remaining syllables.',
        },
        revealIndexes: alternatingIndexes(remaining),
        rankedPenaltyUnits: 1,
      },
    ]);
  }

  for (const { draftPath, draft } of staged) {
    fs.writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf-8');
  }
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalogData, null, 2)}\n`, 'utf-8');

  console.log(`Ladder Batch-1: ${staged.length} packs updated in drafts and catalog.v1.json.`);
  for (const reason of skipped) console.log(`  skipped ${reason}`);
}

main();
