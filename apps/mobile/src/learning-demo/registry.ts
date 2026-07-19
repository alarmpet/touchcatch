import { buildDemoEntry, type Bundle } from './data.js';

declare const require: (path: string) => number;

const enResilience = require('../../../../content/learning/drafts/en-resilience.json') as unknown as Bundle;
const enDilemma = require('../../../../content/learning/drafts/en-dilemma.json') as unknown as Bundle;
const enSustainability = require('../../../../content/learning/drafts/en-sustainability.json') as unknown as Bundle;
const darkUnderLamp = require('../../../../content/learning/drafts/ko-proverb-dark-under-lamp.json') as unknown as Bundle;
const seeingIsBelieving = require('../../../../content/learning/drafts/ko-proverb-seeing-is-believing.json') as unknown as Bundle;
const kindWordsReturn = require('../../../../content/learning/drafts/ko-proverb-kind-words-return.json') as unknown as Bundle;
const turnMisfortune = require('../../../../content/learning/drafts/ko-idiom-turn-misfortune.json') as unknown as Bundle;
const prepareAhead = require('../../../../content/learning/drafts/ko-idiom-prepare-ahead.json') as unknown as Bundle;
const perspective = require('../../../../content/learning/drafts/ko-idiom-perspective.json') as unknown as Bundle;

// DEV-only registry: private solutions never cross a network or production API boundary.
export const learningDemoEntries = [
  buildDemoEntry('ENGLISH', enResilience, { imageA: require('../../../../content/learning/source/en-resilience-a.png'), imageB: require('../../../../content/learning/source/en-resilience-b.png') }),
  buildDemoEntry('ENGLISH', enDilemma, { imageA: require('../../../../content/learning/source/en-dilemma-a.png'), imageB: require('../../../../content/learning/source/en-dilemma-b.png') }),
  buildDemoEntry('ENGLISH', enSustainability, { imageA: require('../../../../content/learning/source/en-sustainability-a.png'), imageB: require('../../../../content/learning/source/en-sustainability-b.png') }),
  buildDemoEntry('PROVERB', darkUnderLamp, { imageA: require('../../../../content/learning/source/ko-proverb-dark-under-lamp-a.png'), imageB: require('../../../../content/learning/source/ko-proverb-dark-under-lamp-b.png') }),
  buildDemoEntry('PROVERB', seeingIsBelieving, { imageA: require('../../../../content/learning/source/ko-proverb-seeing-is-believing-a.png'), imageB: require('../../../../content/learning/source/ko-proverb-seeing-is-believing-b.png') }),
  buildDemoEntry('PROVERB', kindWordsReturn, { imageA: require('../../../../content/learning/source/ko-proverb-kind-words-return-a.png'), imageB: require('../../../../content/learning/source/ko-proverb-kind-words-return-b.png') }),
  buildDemoEntry('IDIOM', turnMisfortune, { imageA: require('../../../../content/learning/source/ko-idiom-turn-misfortune-a.png'), imageB: require('../../../../content/learning/source/ko-idiom-turn-misfortune-b.png') }),
  buildDemoEntry('IDIOM', prepareAhead, { imageA: require('../../../../content/learning/source/ko-idiom-prepare-ahead-a.png'), imageB: require('../../../../content/learning/source/ko-idiom-prepare-ahead-b.png') }),
  buildDemoEntry('IDIOM', perspective, { imageA: require('../../../../content/learning/source/ko-idiom-perspective-a.png'), imageB: require('../../../../content/learning/source/ko-idiom-perspective-b.png') }),
] as const;
