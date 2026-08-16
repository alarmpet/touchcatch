import { useState } from 'react';
import type React from 'react';
import * as ReactNative from 'react-native';
import { Pressable, Text, View } from 'react-native';
import { evaluatePreviewAnswer } from '../../src/features/answer-modes/answer-mode';
import { colors, spacing } from '../../src/ui/design-tokens';
import { buttonStyle, buttonTextStyle, field, surface, text } from '../../src/ui/ui-kit';

// The workspace's React Native type shim omits TextInput; the runtime still provides it.
const TextInput = (ReactNative as unknown as {
  TextInput: React.ComponentType<Record<string, unknown>>;
}).TextInput;

export default function AnswerRoute() {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const canSubmit = answer.trim().length > 0;
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.canvas }}>
    <View style={{ ...surface.cardLifted, width: '100%', maxWidth: 420, gap: spacing.md }}>
      <View style={{ gap: 6 }}>
        <Text style={text.overline}>단어 · 속담 · 사자성어</Text>
        <Text style={text.title}>정답을 입력해 주세요</Text>
      </View>
      <View style={{ ...surface.quiet, gap: 2 }}>
        <Text style={text.overline}>초성 힌트</Text>
        <Text style={text.bodyStrong}>ㅂㅁㅇ ㅂㅇㅇㄱ</Text>
      </View>
      <TextInput
        accessibilityLabel="Answer input"
        value={answer}
        onChangeText={setAnswer}
        placeholder="정답을 입력하세요"
        placeholderTextColor={colors.faint}
        style={field.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Submit answer"
        accessibilityState={{ disabled: !canSubmit }}
        disabled={!canSubmit}
        onPress={() => setSubmitted(true)}
        style={buttonStyle(canSubmit ? 'primary' : 'disabled', { block: true })}
      >
        <Text style={buttonTextStyle(canSubmit ? 'primary' : 'disabled')}>제출</Text>
      </Pressable>
      {submitted && <Text accessibilityLiveRegion="polite" style={{ ...text.caption, textAlign: 'center' }}>{evaluatePreviewAnswer({ category: 'PROVERB', surface: 'PATTERN_ASSISTED', rawAnswer: answer }).correct === null ? '서버 판정 대기 중입니다.' : '판정 완료'}</Text>}
    </View>
  </View>;
}
