import { LearningDemoScreen, type LearningDemoEntry } from './LearningDemoScreen';

/** Development-only preview entry point. Product routes must not import this module. */
export function LearningDemoHome({ entries, onExit }: Readonly<{
  entries: readonly LearningDemoEntry[];
  onExit?: () => void;
}>) {
  return <LearningDemoScreen entries={entries} {...(onExit ? { onExit } : {})} />;
}
