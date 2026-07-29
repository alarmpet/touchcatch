import React from 'react';
import { readFile } from 'node:fs/promises';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { LearningDemoEntry } from './data.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({ Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('./LearningDemoScreen.js', async () => {
  const React = await import('react');
  return {
    LearningDemoScreen: ({ entry, onReplay, onExit }: any) => React.createElement(
      'View',
      { accessibilityLabel: '틀린 그림 찾기' },
      React.createElement('Text', null, entry.title),
      React.createElement('Pressable', { accessibilityLabel: '다시 하기', onPress: onReplay }),
      React.createElement('Pressable', { accessibilityLabel: '다른 문제 선택', onPress: onExit }),
    ),
  };
});
import { GuestGameScreen } from './GuestGameScreen.js';

const entry: LearningDemoEntry = {
  key: 'one', category: 'ENGLISH', title: 'resilience', imageA: 1, imageB: 2,
  sourceSize: { width: 300, height: 200 },
  differences: [{ id: 'd1', tier: 'NORMAL', imageA: { cx: .5, cy: .5, r: .2 }, imageB: { cx: .5, cy: .5, r: .2 } }],
  prompt: 'Meaning?', options: [{ id: 'right', label: 'Recovery' }], correctOptionId: 'right',
};

describe('GuestGameScreen', () => {
  it('moves from the catalog to a selected game and back', () => {
    let tree: any;
    act(() => { tree = create(<GuestGameScreen entries={[entry]} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '학습 게임 선택' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'resilience 시작' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: '틀린 그림 찾기' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: '다른 문제 선택' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: '학습 게임 선택' })).toBeTruthy();
  });

  it('renders an explicit empty state', () => {
    let tree: any;
    act(() => { tree = create(<GuestGameScreen entries={[]} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '플레이 가능한 문제가 없습니다' })).toBeTruthy();
  });

  it('remounts the current game when replaying', () => {
    let tree: any;
    act(() => { tree = create(<GuestGameScreen entries={[entry]} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: 'resilience 시작' }).props.onPress());
    const first = tree.root.findByProps({ accessibilityLabel: '틀린 그림 찾기' });
    act(() => tree.root.findByProps({ accessibilityLabel: '다시 하기' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: '틀린 그림 찾기' })).not.toBe(first);
  });

  it('keeps all visible Korean copy valid UTF-8 without known mojibake', async () => {
    for (const file of ['GuestGameScreen.tsx', 'LearningDemoScreen.tsx']) {
      const source = await readFile(`apps/mobile/src/learning-demo/${file}`, 'utf8');
      expect(source).not.toContain('\uFFFD');
      expect(source).not.toMatch(/(?:\?숈|\?由|李얠|\?ㅼ떆|\?대\?吏|\?뚮젅)/u);
    }
  });
});
