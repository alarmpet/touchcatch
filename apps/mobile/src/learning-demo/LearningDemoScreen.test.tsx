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
  differences: [{ id: 'd1', imageA: { cx: .5, cy: .5, r: .2 }, imageB: { cx: .5, cy: .5, r: .2 } }],
  prompt: 'Meaning?', options: [{ id: 'right', label: 'Recovery' }, { id: 'wrong', label: 'Delay' }], correctOptionId: 'right',
};

describe('LearningDemoScreen', () => {
  it('plays from image tap through meaning completion and restart', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const board = tree.root.findByProps({ testID: 'demo-board-A' });
    act(() => board.props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 100 } }));
    expect(tree.root.findByProps({ accessibilityLabel: 'Meaning quiz' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Recovery' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: 'Learning complete' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Play again' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' })).toBeTruthy();
  });

  it('keeps each board at the source image aspect ratio so tap coordinates stay aligned', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.style).toMatchObject({ width: '100%', aspectRatio: 1.5 });
    expect(tree.root.findByProps({ testID: 'demo-board-B' }).props.style).toMatchObject({ width: '100%', aspectRatio: 1.5 });
    expect(tree.root.findByProps({ accessibilityLabel: 'Difference boards' }).type).toBe('ScrollView');
  });

  it('draws claimed regions with the same normalized x and y radii used by hit testing', () => {
    const twoDifferences = { ...entry, differences: [...entry.differences, { id: 'd2', imageA: { cx: .2, cy: .2, r: .05 }, imageB: { cx: .2, cy: .2, r: .05 } }] };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[twoDifferences]} />); });
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 100 } }));
    expect(tree.root.findByProps({ testID: 'claimed-A-d1' }).props.style).toMatchObject({ width: '40%', height: '40%' });
  });

  it('resets progress when a different lesson is selected', () => {
    const second = { ...entry, key: 'two', title: 'dilemma' };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry, second]} />); });
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 100 } }));
    expect(tree.root.findByProps({ accessibilityLabel: 'Meaning quiz' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Select dilemma' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'claimed-A-d1' })).toHaveLength(0);
  });
});
