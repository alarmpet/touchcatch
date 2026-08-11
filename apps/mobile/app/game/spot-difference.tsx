import { LearningDemoHome } from '../../src/learning-demo/preview-home';
import { useRouter } from 'expo-router';

export default function LearningSessionRoute() {
  const router = useRouter();
  if (!__DEV__) throw new Error('Learning preview requires authenticated server projections in production');
  // Kept behind the DEV guard so private preview data is not evaluated by production routes.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { learningDemoEntries } = require('../../src/learning-demo/registry');
  return <LearningDemoHome entries={learningDemoEntries} onExit={() => router.replace('/')} />;
}
