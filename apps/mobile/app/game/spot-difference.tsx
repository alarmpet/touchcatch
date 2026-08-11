import { LearningDemoHome } from '../../src/learning-demo/preview-home';
import { learningPreviewEntries } from '../../src/learning-demo/preview-registry';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

export default function LearningSessionRoute() {
  const router = useRouter();
  if (!__DEV__) return <View accessibilityLabel="학습 콘텐츠 준비 중" style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Text>승인된 학습 콘텐츠를 불러올 수 없어요.</Text></View>;
  return <LearningDemoHome entries={learningPreviewEntries} onExit={() => router.replace('/')} />;
}
