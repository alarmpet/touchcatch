import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HintStepV1 } from '../../../../packages/contracts/src/content';
import { createDemoState, reduceDemoState, type Circle, type DemoState } from './controller';
import { buildAnswerPattern, evaluatePreviewAnswer } from '../features/answer-modes/answer-mode';

export type LearningDemoEntry = Readonly<{
  key: string;
  category: 'ENGLISH' | 'PROVERB' | 'IDIOM' | 'GENERAL_KNOWLEDGE';
  preferredInputSurface: 'MULTIPLE_CHOICE' | 'FREE_TEXT';
  assistPattern: 'SPELLING' | 'INITIAL_PATTERN' | 'NONE';
  title: string;
  imageA: ImageSourcePropType;
  imageB: ImageSourcePropType;
  differences: ReadonlyArray<Readonly<{ id: string; imageA: Circle; imageB: Circle }>>;
  prompt: string;
  options: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  correctOptionId: string;
  hintUnits?: readonly string[];
  hintLadder?: readonly HintStepV1[];
  hintAdmissionHash?: string;
}>;

export function LearningDemoScreen({ entries, onExit }: Readonly<{
  entries: readonly LearningDemoEntry[];
  onExit?: () => void;
}>) {
  if (!entries.length) throw new Error('LEARNING_DEMO_REQUIRES_CONTENT');
  const [selectedKey, setSelectedKey] = useState(entries[0]!.key);
  const selected = useMemo(() => entries.find((entry) => entry.key === selectedKey) ?? entries[0]!, [entries, selectedKey]);
  const [state, setState] = useState<DemoState>(() => createDemoState(selected));
  const [layouts, setLayouts] = useState({ A: { width: 1, height: 1 }, B: { width: 1, height: 1 } });
  const [hintIndex, setHintIndex] = useState(0);
  const [thisAttemptScore, setThisAttemptScore] = useState<number | null>(null);
  const [answerInput, setAnswerInput] = useState('');

  const choose = (entry: LearningDemoEntry) => {
    setSelectedKey(entry.key);
    setState(createDemoState(entry));
    setHintIndex(0);
    setThisAttemptScore(null);
    setAnswerInput('');
  };
  const act = (action: Parameters<typeof reduceDemoState>[2]) => setState((current) => reduceDemoState(current, selected, action));
  const ink = '#17324D', surface = '#FFFFFF', primary = '#0B7A75';

  const categoryLabel = selected.category === 'ENGLISH' ? '영어 단어' : selected.category === 'PROVERB' ? '속담' : selected.category === 'IDIOM' ? '사자성어' : '상식';
  const fallbackHintText = selected.hintUnits?.length && selected.assistPattern !== 'NONE'
    ? `${selected.assistPattern === 'SPELLING' ? '스펠링' : '초성'} 힌트: ${buildAnswerPattern(selected.category, selected.title)}`
    : undefined;
  const totalHintSteps = selected.hintLadder?.length ?? (fallbackHintText ? 1 : 0);
  const currentHintText = hintIndex > 0
    ? selected.hintLadder?.[hintIndex - 1]?.localizedText.ko ?? fallbackHintText
    : undefined;

  return <SafeAreaView accessibilityLabel="Learning spot the difference" style={{ flex: 1, backgroundColor: '#3A70B5' }}>
    {/* Full Screen In-Game Header */}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={onExit ?? (() => choose(selected))} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>‹</Text>
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text accessibilityRole="header" style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>레벨 {entries.findIndex(e => e.key === selected.key) + 1} · {categoryLabel}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 }}>
        <Text style={{ fontSize: 14 }}>❤️</Text>
        <Text style={{ color: '#FFF', fontWeight: 'bold', marginLeft: 4 }}>5</Text>
      </View>
    </View>

    {/* 10 Differences Check Indicators Bar */}
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 6, paddingHorizontal: 12 }}>
      {Array.from({ length: selected.differences.length }).map((_, idx) => {
        const isFound = idx < state.claimedIds.length;
        return <View key={idx} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isFound ? '#4CAF50' : 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#FFF' }}>
          <Text style={{ color: '#FFF', fontSize: 12, fontWeight: 'bold' }}>{isFound ? '✓' : '?'}</Text>
        </View>;
      })}
    </View>

    {/* In-Game Center Play Board Area */}
    {state.phase === 'FIND' && <ScrollView accessibilityLabel="Difference boards" contentContainerStyle={{ gap: 4, paddingHorizontal: 8, paddingBottom: 8, flexGrow: 1, justifyContent: 'center' }}>
      {(['A', 'B'] as const).map((side) => <Pressable key={side} testID={`demo-board-${side}`} accessibilityRole="imagebutton" accessibilityLabel={`Difference image ${side}`} onLayout={(event: { nativeEvent: { layout: { width: number; height: number } } }) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setLayouts((current) => ({ ...current, [side]: { width, height } }));
        }
      }} onPress={(event: any) => {
        const ne = event.nativeEvent || {};
        const containerElem = event.currentTarget || event.target;

        let clientX: number | undefined;
        let clientY: number | undefined;

        if (ne.changedTouches && ne.changedTouches[0]) {
          clientX = ne.changedTouches[0].clientX;
          clientY = ne.changedTouches[0].clientY;
        } else if (ne.touches && ne.touches[0]) {
          clientX = ne.touches[0].clientX;
          clientY = ne.touches[0].clientY;
        } else {
          clientX = ne.clientX ?? ne.pageX;
          clientY = ne.clientY ?? ne.pageY;
        }

        let tapX = 0;
        let tapY = 0;

        if (typeof clientX === 'number' && typeof clientY === 'number' && containerElem && typeof containerElem.getBoundingClientRect === 'function') {
          const rect = containerElem.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            tapX = (clientX - rect.left) / rect.width;
            tapY = (clientY - rect.top) / rect.height;
          }
        } else {
          const locX = ne.locationX ?? ne.offsetX ?? 0;
          const locY = ne.locationY ?? ne.offsetY ?? 0;
          const width = layouts[side].width || 300;
          const height = layouts[side].height || 300;
          tapX = locX / width;
          tapY = locY / height;
        }

        tapX = Math.max(0, Math.min(1, tapX));
        tapY = Math.max(0, Math.min(1, tapY));
        act({ type: 'TAP', side, x: tapX, y: tapY });
      }} style={{ width: '100%', aspectRatio: 1, minHeight: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', borderWidth: 2, borderColor: '#FFF' }}>
        <Image source={side === 'A' ? selected.imageA : selected.imageB} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
        {selected.differences.filter((difference) => state.claimedIds.includes(difference.id)).map((difference) => { const circle = side === 'A' ? difference.imageA : difference.imageB; const displayR = Math.max(circle.r, 0.08); return <View key={difference.id} testID={`claimed-${side}-${difference.id}`} style={{ position: 'absolute', left: `${(circle.cx - displayR) * 100}%`, top: `${(circle.cy - displayR) * 100}%`, width: `${displayR * 200}%`, height: `${displayR * 200}%`, borderRadius: 999, borderWidth: 4, borderColor: '#76FF03', backgroundColor: 'rgba(118, 255, 3, 0.35)', pointerEvents: 'none' }} />; })}
      </Pressable>)}
    </ScrollView>}

    {/* Stage Complete Quiz Popup */}
    {state.phase === 'QUIZ' && <View accessibilityLabel="Meaning quiz" style={{ flex: 1, justifyContent: 'center', gap: 12, padding: 20, backgroundColor: '#FFF', margin: 16, borderRadius: 16 }}>
      <Text style={{ color: '#17324D', fontSize: 22, fontWeight: 'bold', textAlign: 'center' }}>🎉 10개 차이점 완벽 탐지 완료!</Text>
      <Text style={{ color: '#475569', fontSize: 16, textAlign: 'center', marginBottom: 8 }}>그림과 힌트를 바탕으로 {categoryLabel} 정답을 직접 입력해 보세요.</Text>
      <TextInput accessibilityLabel="Answer input" value={answerInput} onChangeText={setAnswerInput} autoCapitalize="none" autoCorrect={false} placeholder="정답 입력" style={{ minHeight: 52, padding: 14, backgroundColor: '#EFF6FF', borderColor: '#BDD7EE', borderWidth: 1, borderRadius: 12, color: '#17324D', fontSize: 18 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Submit answer" onPress={() => {
        const result = evaluatePreviewAnswer({ category: selected.category, surface: hintIndex > 0 ? 'PATTERN_ASSISTED' : 'FREE_TEXT', rawAnswer: answerInput, expectedAnswer: selected.title });
        if (result.correct) {
          setThisAttemptScore(Math.max(0, 100000 - hintIndex * 15000 - state.wrongAnswers * 5000));
          act({ type: 'ANSWER', optionId: selected.correctOptionId });
        } else {
          act({ type: 'ANSWER', optionId: '__free_text_wrong__' });
        }
      }} style={{ minHeight: 52, padding: 14, backgroundColor: '#0B7A75', borderRadius: 12, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#FFF', fontSize: 17, fontWeight: 'bold' }}>정답 제출</Text></Pressable>
      {state.wrongAnswers > 0 && <Text accessibilityLiveRegion="polite" style={{ color: '#B42318', textAlign: 'center' }}>다시 생각해 보세요.</Text>}
    </View>}

    {/* Completion Results */}
    {state.phase === 'COMPLETE' && <ScrollView accessibilityLabel="Learning complete" contentContainerStyle={{ padding: 20 }}>
      <View accessibilityLabel="Casual result" style={{ padding: 20, backgroundColor: '#FFFFFF', borderRadius: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 40, marginBottom: 8 }}>🏆</Text>
        <Text style={{ color: '#17324D', fontSize: 24, fontWeight: '800' }}>스테이지 클리어!</Text>
        <Text style={{ color: '#0B7A75', fontSize: 20, fontWeight: '700', marginTop: 8 }}>최종 점수: {thisAttemptScore ?? 100000}점</Text>
        <Text style={{ color: '#64748B', marginTop: 8, textAlign: 'center' }}>10개 틀린 그림을 모두 찾아 학습 퀴즈를 완료했습니다.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Play again" onPress={() => { setState(createDemoState(selected)); setHintIndex(0); setThisAttemptScore(null); setAnswerInput(''); }} style={{ minHeight: 52, padding: 14, backgroundColor: '#FFD166', borderRadius: 26, marginTop: 24, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#17324D', fontSize: 18, fontWeight: '800' }}>다음 스테이지 도전하기</Text></Pressable>
    </ScrollView>}

    {/* Bottom Floating Hint Bulb Footer */}
    <View style={{ backgroundColor: '#2C5A96', paddingVertical: 8, paddingHorizontal: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16, alignItems: 'center' }}>
      {state.phase === 'FIND' && currentHintText ? <Text testID="current-hint" accessibilityLiveRegion="polite" style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>{currentHintText}</Text> : null}
      {state.phase === 'FIND' && totalHintSteps > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 6 }}>
        <Pressable accessibilityLabel="Use hint" disabled={hintIndex >= totalHintSteps} onPress={() => setHintIndex((prev) => Math.min(prev + 1, totalHintSteps))} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: hintIndex >= totalHintSteps ? '#94A3B8' : '#FFD166', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 }}>
          <Text style={{ fontSize: 24 }}>💡</Text>
          <View style={{ position: 'absolute', top: -2, right: -2, backgroundColor: '#E25555', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
            <Text testID="hint-remaining" style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{Math.max(0, totalHintSteps - hintIndex)}</Text>
          </View>
        </Pressable>
      </View>}

      <ScrollView horizontal accessibilityLabel="Content selection" style={{ maxHeight: 40 }}>
        {entries.map((entry, index) => { const label = entry.category === 'ENGLISH' ? '영어' : entry.category === 'PROVERB' ? '속담' : entry.category === 'IDIOM' ? '사자성어' : '상식'; return <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={`Select stage ${index + 1} ${label}`} onPress={() => choose(entry)} style={{ minHeight: 34, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginHorizontal: 3, backgroundColor: entry.key === selected.key ? '#FFB703' : 'rgba(255,255,255,0.2)' }}><Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 }}>{index + 1} · {label}</Text></Pressable>; })}
      </ScrollView>
    </View>
  </SafeAreaView>;
}
