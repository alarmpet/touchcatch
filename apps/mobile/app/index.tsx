import { LearningDemoScreen } from '../src/learning-demo/LearningDemoScreen.js';
import type { LearningDemoEntry } from '../src/learning-demo/LearningDemoScreen.js';

declare const __DEV__: boolean;
declare const require: (path: string) => typeof import('../src/learning-demo/registry.js');

export function LearningDemoHome({ entries }: Readonly<{ entries: readonly LearningDemoEntry[] }>) {
  return <LearningDemoScreen entries={entries} />;
}

export default function Home() {
  if (!__DEV__) throw new Error('Learning demo is DEV-only; production requires authenticated server projections');
  const { learningDemoEntries } = require('../src/learning-demo/registry.js');
  return <LearningDemoHome entries={learningDemoEntries} />;
}
