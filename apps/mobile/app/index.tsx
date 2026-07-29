import { GuestGameScreen } from '../src/learning-demo/GuestGameScreen';
import type { LearningDemoEntry } from '../src/learning-demo/data';

declare const __DEV__: boolean;
declare const require: (path: string) => typeof import('../src/learning-demo/registry');

export function LearningDemoHome({ entries }: Readonly<{ entries: readonly LearningDemoEntry[] }>) {
  return <GuestGameScreen entries={entries} />;
}

export default function Home() {
  if (!__DEV__) throw new Error('Guest device registry is DEV-only; production requires server projection');
  const { learningDemoEntries } = require('../src/learning-demo/registry');
  return <LearningDemoHome entries={learningDemoEntries} />;
}
