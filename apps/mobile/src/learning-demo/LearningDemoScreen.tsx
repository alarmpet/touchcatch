import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createDemoState, reduceDemoState, type Circle, type DemoState } from './controller.js';

export type LearningDemoEntry = Readonly<{
  key: string;
  category: 'ENGLISH' | 'PROVERB' | 'IDIOM';
  title: string;
  imageA: unknown;
  imageB: unknown;
  differences: ReadonlyArray<Readonly<{ id: string; imageA: Circle; imageB: Circle }>>;
  prompt: string;
  options: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  correctOptionId: string;
}>;

export function LearningDemoScreen({ entries }: Readonly<{ entries: readonly LearningDemoEntry[] }>) {
  if (!entries.length) throw new Error('LEARNING_DEMO_REQUIRES_CONTENT');
  const [selectedKey, setSelectedKey] = useState(entries[0]!.key);
  const selected = useMemo(() => entries.find((entry) => entry.key === selectedKey) ?? entries[0]!, [entries, selectedKey]);
  const [state, setState] = useState<DemoState>(() => createDemoState(selected));
  const [layouts, setLayouts] = useState({ A: { width: 1, height: 1 }, B: { width: 1, height: 1 } });
  const choose = (entry: LearningDemoEntry) => { setSelectedKey(entry.key); setState(createDemoState(entry)); };
  const act = (action: Parameters<typeof reduceDemoState>[2]) => setState((current) => reduceDemoState(current, selected, action));
  const ink = '#17324D', surface = '#FFFFFF', primary = '#0B7A75';

  return <SafeAreaView accessibilityLabel="Learning spot the difference" style={{ flex: 1, backgroundColor: '#F5FAFF' }}>
    <Text accessibilityRole="header" style={{ color: ink, fontSize: 24, fontWeight: '700', padding: 12 }}>학습 틀린그림찾기</Text>
    <ScrollView horizontal accessibilityLabel="Content selection" style={{ maxHeight: 56 }}>
      {entries.map((entry) => <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={`Select ${entry.title}`} onPress={() => choose(entry)} style={{ minHeight: 48, padding: 12, backgroundColor: entry.key === selected.key ? primary : surface }}><Text style={{ color: entry.key === selected.key ? '#FFFFFF' : ink }}>{entry.title}</Text></Pressable>)}
    </ScrollView>
    <Text accessibilityLiveRegion="polite" style={{ color: ink, paddingHorizontal: 12 }}>{selected.category} · {state.claimedIds.length}/{selected.differences.length}</Text>
    {state.phase === 'FIND' && <ScrollView accessibilityLabel="Difference boards" contentContainerStyle={{ gap: 8, padding: 8 }}>
      {(['A', 'B'] as const).map((side) => <Pressable key={side} testID={`demo-board-${side}`} accessibilityRole="imagebutton" accessibilityLabel={`Difference image ${side}`} onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => setLayouts((current) => ({ ...current, [side]: event.nativeEvent.layout }))} onPress={(event: { nativeEvent: { locationX: number; locationY: number } }) => act({ type: 'TAP', side, x: event.nativeEvent.locationX / layouts[side].width, y: event.nativeEvent.locationY / layouts[side].height })} style={{ width: '100%', aspectRatio: 1.5, minHeight: 48, overflow: 'hidden', backgroundColor: surface }}>
        <Image source={side === 'A' ? selected.imageA : selected.imageB} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        {selected.differences.filter((difference) => state.claimedIds.includes(difference.id)).map((difference) => { const circle = side === 'A' ? difference.imageA : difference.imageB; return <View key={difference.id} testID={`claimed-${side}-${difference.id}`} pointerEvents="none" style={{ position: 'absolute', left: `${(circle.cx - circle.r) * 100}%`, top: `${(circle.cy - circle.r) * 100}%`, width: `${circle.r * 200}%`, height: `${circle.r * 200}%`, borderRadius: 999, borderWidth: 4, borderColor: '#FFB703' }} />; })}
      </Pressable>)}
    </ScrollView>}
    {state.phase === 'QUIZ' && <View accessibilityLabel="Meaning quiz" style={{ flex: 1, justifyContent: 'center', gap: 10, padding: 20 }}><Text style={{ color: ink, fontSize: 22 }}>{selected.prompt}</Text>{selected.options.map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.label} onPress={() => act({ type: 'ANSWER', optionId: option.id })} style={{ minHeight: 48, padding: 14, backgroundColor: surface }}><Text style={{ color: ink }}>{option.label}</Text></Pressable>)}{state.wrongAnswers > 0 && <Text accessibilityLiveRegion="polite" style={{ color: '#B42318' }}>다시 생각해 보세요.</Text>}</View>}
    {state.phase === 'COMPLETE' && <View accessibilityLabel="Learning complete" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}><Text style={{ color: ink, fontSize: 28 }}>완료!</Text><Pressable accessibilityRole="button" accessibilityLabel="Play again" onPress={() => setState(createDemoState(selected))} style={{ minHeight: 48, padding: 14, backgroundColor: primary }}><Text style={{ color: '#FFFFFF' }}>다시하기</Text></Pressable></View>}
  </SafeAreaView>;
}
