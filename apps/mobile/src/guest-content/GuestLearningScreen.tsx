import { Text, View } from 'react-native';
import type { PublicGuestSample } from './registry';

export function GuestLearningScreen({ samples }: Readonly<{ samples: readonly PublicGuestSample[] }>) {
  return <View accessibilityLabel="guest-learning-samples">
    <Text>학습 테마</Text>
    {samples.map((sample) => <Text key={sample.contentKey}>{sample.category}: {sample.theme}</Text>)}
    <Text accessibilityRole="alert">공개 샘플은 권리 및 교육 검토 승인 후 플레이할 수 있습니다.</Text>
  </View>;
}
