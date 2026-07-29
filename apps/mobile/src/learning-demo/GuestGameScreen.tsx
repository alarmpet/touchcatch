import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LearningDemoEntry } from './data';
import { LearningDemoScreen } from './LearningDemoScreen';

type GuestRoute =
  | Readonly<{ name: 'CATALOG' }>
  | Readonly<{ name: 'PLAYING'; contentKey: string; session: number }>;

export function GuestGameScreen({ entries }: Readonly<{ entries: readonly LearningDemoEntry[] }>) {
  const [route, setRoute] = useState<GuestRoute>({ name: 'CATALOG' });
  if (route.name === 'PLAYING') {
    const entry = entries.find((item) => item.key === route.contentKey);
    if (!entry) {
      return <Text accessibilityLabel="플레이 가능한 문제가 없습니다">플레이 가능한 문제가 없습니다</Text>;
    }
    return <LearningDemoScreen
      key={`${entry.key}-${route.session}`}
      entry={entry}
      onReplay={() => setRoute({ ...route, session: route.session + 1 })}
      onExit={() => setRoute({ name: 'CATALOG' })}
    />;
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: '#F5FAFF' }}>
    <View accessibilityLabel="학습 게임 선택" style={{ flex: 1, padding: 16 }}>
      <Text accessibilityRole="header" style={{ color: '#17324D', fontSize: 26, fontWeight: '700' }}>학습 게임 선택</Text>
      {entries.length === 0
        ? <Text accessibilityLabel="플레이 가능한 문제가 없습니다" style={{ color: '#17324D', marginTop: 24 }}>플레이 가능한 문제가 없습니다</Text>
        : <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 16 }}>
          {entries.map((entry) => <Pressable
            key={entry.key}
            accessibilityRole="button"
            accessibilityLabel={`${entry.title} 시작`}
            onPress={() => setRoute({ name: 'PLAYING', contentKey: entry.key, session: 0 })}
            style={{ minHeight: 48, padding: 16, backgroundColor: '#FFFFFF' }}
          >
            <Text style={{ color: '#17324D', fontSize: 20 }}>{entry.title}</Text>
          </Pressable>)}
        </ScrollView>}
    </View>
  </SafeAreaView>;
}
