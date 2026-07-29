import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { LearningDemoEntry } from './LearningDemoScreen.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({ Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
import { LearningDemoScreen } from './LearningDemoScreen.js';

const entry: LearningDemoEntry = {
  key: 'one', category: 'ENGLISH', title: 'resilience', imageA: 1, imageB: 2,
  sourceSize: { width: 300, height: 200 },
  differences: [{ id: 'd1', tier: 'NORMAL', imageA: { cx: .5, cy: .5, r: .2 }, imageB: { cx: .5, cy: .5, r: .2 } }],
  prompt: 'Meaning?', options: [{ id: 'right', label: 'Recovery' }, { id: 'wrong', label: 'Delay' }], correctOptionId: 'right',
};

function finishLoading(tree: any) {
  act(() => {
    for (const image of tree.root.findAllByType('Image')) image.props.onLoad();
  });
}

function layout(tree: any, side: 'A' | 'B', width = 300, height = 200) {
  act(() => tree.root.findByProps({ testID: `demo-board-${side}` }).props.onLayout({ nativeEvent: { layout: { width, height } } }));
}

function tap(tree: any, side: 'A' | 'B', x: number, y: number) {
  act(() => tree.root.findByProps({ testID: `demo-board-${side}` }).props.onPress({ nativeEvent: { locationX: x, locationY: y } }));
}

describe('LearningDemoScreen', () => {
  it('plays from image tap through meaning completion and restart', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    finishLoading(tree);
    layout(tree, 'A');
    tap(tree, 'A', 150, 100);
    expect(tree.root.findByProps({ accessibilityLabel: '뜻 퀴즈' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Recovery' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: '학습 완료' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: '다시 하기' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' })).toBeTruthy();
  });

  it('keeps each board at the source aspect ratio', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.style).toMatchObject({ width: '100%', aspectRatio: 1.5 });
    expect(tree.root.findByProps({ testID: 'demo-board-B' }).props.style).toMatchObject({ width: '100%', aspectRatio: 1.5 });
    expect(tree.root.findByProps({ accessibilityLabel: '차이 이미지' }).type).toBe('ScrollView');
  });

  it('draws claimed regions relative to the contained image', () => {
    const two = { ...entry, differences: [...entry.differences, { id: 'd2', tier: 'HARD' as const, imageA: { cx: .2, cy: .2, r: .05 }, imageB: { cx: .2, cy: .2, r: .05 } }] };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[two]} />); });
    finishLoading(tree);
    layout(tree, 'A');
    tap(tree, 'A', 150, 100);
    expect(tree.root.findByProps({ testID: 'claimed-A-d1' }).props.style).toMatchObject({ width: '40%', height: '40%' });
    expect(tree.root.findByProps({ testID: 'contained-overlay-A' }).props.style).toMatchObject({ left: 0, top: 0, width: 300, height: 200 });
  });

  it('ignores zero layout and contain padding before accepting the image center', () => {
    const two = { ...entry, differences: [...entry.differences, { id: 'd2', tier: 'HARD' as const, imageA: { cx: .2, cy: .2, r: .05 }, imageB: { cx: .2, cy: .2, r: .05 } }] };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[two]} />); });
    finishLoading(tree);
    tap(tree, 'A', 180, 180);
    expect(tree.root.findAllByProps({ testID: 'claimed-A-d1' })).toHaveLength(0);
    layout(tree, 'A', 360, 360);
    tap(tree, 'A', 180, 30);
    expect(tree.root.findAllByProps({ testID: 'claimed-A-d1' })).toHaveLength(0);
    tap(tree, 'A', 180, 180);
    expect(tree.root.findByProps({ testID: 'contained-overlay-A' }).props.style).toMatchObject({ left: 0, top: 60, width: 360, height: 240 });
  });

  it('uses the tapped board own layout measurement', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    finishLoading(tree);
    layout(tree, 'A', 360, 360);
    layout(tree, 'B', 400, 200);
    tap(tree, 'B', 200, 100);
    expect(tree.root.findByProps({ accessibilityLabel: '뜻 퀴즈' })).toBeTruthy();
  });

  it('resets progress and image state when selecting another lesson', () => {
    const second = { ...entry, key: 'two', title: 'dilemma' };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry, second]} />); });
    finishLoading(tree);
    layout(tree, 'A');
    tap(tree, 'A', 150, 100);
    expect(tree.root.findByProps({ accessibilityLabel: '뜻 퀴즈' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'dilemma 선택' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.accessibilityState).toEqual({ disabled: true });
    expect(tree.root.findAllByProps({ testID: 'claimed-A-d1' })).toHaveLength(0);
  });

  it('blocks taps until both images load and exposes retry after failure', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    layout(tree, 'A');
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.accessibilityState).toEqual({ disabled: true });
    act(() => tree.root.findAllByType('Image')[0].props.onLoad());
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.accessibilityState).toEqual({ disabled: true });
    act(() => tree.root.findAllByType('Image')[1].props.onError());
    expect(tree.root.findByProps({ accessibilityRole: 'alert' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: '다시 시도' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.accessibilityState).toEqual({ disabled: true });
    finishLoading(tree);
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.accessibilityState).toEqual({ disabled: false });
  });
});
