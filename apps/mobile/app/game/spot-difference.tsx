import { LearningDemoHome } from '../../src/learning-demo/preview-home';
import type { LearningDemoEntry } from '../../src/learning-demo/LearningDemoScreen';
import { learningPreviewEntries } from '../../src/learning-demo/preview-registry';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { colors, spacing } from '../../src/ui/design-tokens';
import { surface, text } from '../../src/ui/ui-kit';

const CATEGORIES = ['ENGLISH', 'PROVERB', 'IDIOM', 'GENERAL_KNOWLEDGE'] as const;

/** Only an admitted category reaches the screen; anything else falls back to the default pack. */
function admittedCategory(value: unknown): LearningDemoEntry['category'] | undefined {
  return (CATEGORIES as readonly string[]).includes(String(value))
    ? value as LearningDemoEntry['category']
    : undefined;
}

export default function LearningSessionRoute() {
  const router = useRouter();
  const { category, daily } = useLocalSearchParams<{ category?: string; daily?: string }>();
  if (!__DEV__) return <View accessibilityLabel="학습 콘텐츠 준비 중" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.canvas }}>
    <View style={{ ...surface.card, maxWidth: 360, width: '100%', gap: 6 }}>
      <Text style={text.overline}>준비 중</Text>
      <Text style={text.subtitle}>승인된 학습 콘텐츠를 불러올 수 없어요.</Text>
      <Text style={text.caption}>콘텐츠 승인이 끝나면 바로 열려요.</Text>
    </View>
  </View>;
  const initial = admittedCategory(category);
  // The daily board picks itself from the date, so a category is meaningless alongside it.
  const isDaily = daily === '1';
  return <LearningDemoHome
    entries={learningPreviewEntries}
    onExit={() => router.replace('/')}
    {...(isDaily ? { daily: true } : initial ? { initialCategory: initial } : {})}
  />;
}
