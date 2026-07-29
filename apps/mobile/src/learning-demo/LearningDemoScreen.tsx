import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { canAcceptBoardTap, createAssetState, reduceAssetState } from './asset-state';
import { createDemoState, reduceDemoState, type DemoState } from './controller';
import type { LearningDemoEntry } from './data';
import { containRect, normalizeTouch } from './geometry';

export type { LearningDemoEntry } from './data';

type Props = Readonly<{
  entries?: readonly LearningDemoEntry[];
  entry?: LearningDemoEntry;
  onReplay?: () => void;
  onExit?: () => void;
}>;

export function LearningDemoScreen({ entries, entry, onReplay, onExit }: Props) {
  const available = entry ? [entry] : entries ?? [];
  if (!available.length) throw new Error('LEARNING_DEMO_REQUIRES_CONTENT');
  const [selectedKey, setSelectedKey] = useState(available[0]!.key);
  const selected = useMemo(
    () => available.find((item) => item.key === selectedKey) ?? available[0]!,
    [available, selectedKey],
  );
  const [state, setState] = useState<DemoState>(() => createDemoState(selected));
  const [layouts, setLayouts] = useState({ A: { width: 0, height: 0 }, B: { width: 0, height: 0 } });
  const [assets, setAssets] = useState(createAssetState);
  const [assetSession, setAssetSession] = useState(0);
  const choose = (item: LearningDemoEntry) => {
    setSelectedKey(item.key);
    setState(createDemoState(item));
    setLayouts({ A: { width: 0, height: 0 }, B: { width: 0, height: 0 } });
    setAssets(createAssetState());
    setAssetSession((current) => current + 1);
  };
  const act = (action: Parameters<typeof reduceDemoState>[2]) =>
    setState((current) => reduceDemoState(current, selected, action));
  const retryAssets = () => {
    setAssets((current) => reduceAssetState(current, { type: 'RETRY' }));
    setAssetSession((current) => current + 1);
  };
  const replay = () => {
    if (onReplay) onReplay();
    else choose(selected);
  };
  const ink = '#17324D';
  const surface = '#FFFFFF';
  const primary = '#0B7A75';
  const hasFailure = assets.A === 'FAILED' || assets.B === 'FAILED';

  return <SafeAreaView accessibilityLabel="틀린 그림 찾기" style={{ flex: 1, backgroundColor: '#F5FAFF' }}>
    <Text accessibilityRole="header" style={{ color: ink, fontSize: 24, fontWeight: '700', padding: 12 }}>학습 틀린그림찾기</Text>
    {available.length > 1 && <ScrollView horizontal accessibilityLabel="문제 선택" style={{ maxHeight: 56 }}>
      {available.map((item) => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.title} 선택`} onPress={() => choose(item)} style={{ minHeight: 48, padding: 12, backgroundColor: item.key === selected.key ? primary : surface }}><Text style={{ color: item.key === selected.key ? '#FFFFFF' : ink }}>{item.title}</Text></Pressable>)}
    </ScrollView>}
    <Text accessibilityLiveRegion="polite" style={{ color: ink, paddingHorizontal: 12 }}>찾은 차이 {state.claimedIds.length}/{selected.differences.length}</Text>
    {state.phase === 'FIND' && <ScrollView accessibilityLabel="차이 이미지" contentContainerStyle={{ gap: 8, padding: 8 }}>
      {(['A', 'B'] as const).map((side) => {
        const layout = layouts[side];
        const rect = layout.width > 0 && layout.height > 0 ? containRect(layout, selected.sourceSize) : null;
        return <Pressable
          key={side}
          testID={`demo-board-${side}`}
          accessibilityRole="imagebutton"
          accessibilityLabel={`차이 이미지 ${side}`}
          accessibilityState={{ disabled: !canAcceptBoardTap(assets) }}
          disabled={!canAcceptBoardTap(assets)}
          onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) =>
            setLayouts((current) => ({ ...current, [side]: event.nativeEvent.layout }))}
          onPress={(event: { nativeEvent: { locationX: number; locationY: number } }) => {
            if (!rect || !canAcceptBoardTap(assets)) return;
            const point = normalizeTouch({ x: event.nativeEvent.locationX, y: event.nativeEvent.locationY }, rect);
            if (point) act({ type: 'TAP', side, ...point });
          }}
          style={{ width: '100%', aspectRatio: 1.5, minHeight: 48, overflow: 'hidden', backgroundColor: surface }}
        >
          <Image
            key={`${selected.key}-${side}-${assetSession}`}
            source={side === 'A' ? selected.imageA : selected.imageB}
            resizeMode="contain"
            onLoad={() => setAssets((current) => reduceAssetState(current, { type: 'READY', side }))}
            onError={() => setAssets((current) => reduceAssetState(current, { type: 'FAILED', side }))}
            style={{ width: '100%', height: '100%' }}
          />
          {rect && <View testID={`contained-overlay-${side}`} pointerEvents="none" style={{ position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
            {selected.differences.filter((difference) => state.claimedIds.includes(difference.id)).map((difference) => {
              const circle = side === 'A' ? difference.imageA : difference.imageB;
              return <View key={difference.id} testID={`claimed-${side}-${difference.id}`} pointerEvents="none" style={{ position: 'absolute', left: `${(circle.cx - circle.r) * 100}%`, top: `${(circle.cy - circle.r) * 100}%`, width: `${circle.r * 200}%`, height: `${circle.r * 200}%`, borderRadius: 999, borderWidth: 4, borderColor: '#FFB703' }} />;
            })}
          </View>}
        </Pressable>;
      })}
      {!hasFailure && !canAcceptBoardTap(assets) && <Text accessibilityLiveRegion="polite">이미지를 불러오고 있습니다</Text>}
      {hasFailure && <View accessibilityRole="alert">
        <Text>이미지를 불러오지 못했습니다</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={retryAssets}><Text>다시 시도</Text></Pressable>
      </View>}
    </ScrollView>}
    {state.phase === 'QUIZ' && <View accessibilityLabel="뜻 퀴즈" style={{ flex: 1, justifyContent: 'center', gap: 10, padding: 20 }}>
      <Text style={{ color: ink, fontSize: 22 }}>{selected.prompt}</Text>
      {selected.options.map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={option.label} onPress={() => act({ type: 'ANSWER', optionId: option.id })} style={{ minHeight: 48, padding: 14, backgroundColor: surface }}><Text style={{ color: ink }}>{option.label}</Text></Pressable>)}
      {state.wrongAnswers > 0 && <Text accessibilityLiveRegion="polite" style={{ color: '#B42318' }}>다시 생각해 보세요</Text>}
    </View>}
    {state.phase === 'COMPLETE' && <View accessibilityLabel="학습 완료" style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <Text style={{ color: ink, fontSize: 28 }}>완료!</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다시 하기" onPress={replay} style={{ minHeight: 48, padding: 14, backgroundColor: primary }}><Text style={{ color: '#FFFFFF' }}>다시 하기</Text></Pressable>
      {onExit && <Pressable accessibilityRole="button" accessibilityLabel="다른 문제 선택" onPress={onExit} style={{ minHeight: 48, padding: 14 }}><Text style={{ color: ink }}>다른 문제 선택</Text></Pressable>}
    </View>}
  </SafeAreaView>;
}
