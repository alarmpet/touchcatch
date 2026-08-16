import { LearningDemoScreen, type LearningDemoEntry } from './LearningDemoScreen';

/** Development-only preview entry point. Product routes must not import this module. */
export function LearningDemoHome({ entries, onExit, initialCategory, daily }: Readonly<{
  entries: readonly LearningDemoEntry[];
  onExit?: () => void;
  initialCategory?: LearningDemoEntry['category'];
  daily?: boolean;
}>) {
  return <LearningDemoScreen
    entries={entries}
    {...(onExit ? { onExit } : {})}
    {...(initialCategory ? { initialCategory } : {})}
    {...(daily ? { daily } : {})}
  />;
}
