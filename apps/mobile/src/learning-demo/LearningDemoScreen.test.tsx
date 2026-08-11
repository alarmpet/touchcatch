import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { LearningDemoEntry } from './LearningDemoScreen.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('react-native', () => ({ Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
import { LearningDemoScreen } from './LearningDemoScreen.js';

const entry: LearningDemoEntry = {
  key: 'one', category: 'ENGLISH', preferredInputSurface: 'FREE_TEXT', assistPattern: 'SPELLING', title: 'resilience', imageA: 1, imageB: 2,
  differences: [{ id: 'd1', imageA: { cx: .5, cy: .5, r: .2 }, imageB: { cx: .5, cy: .5, r: .2 } }],
  prompt: 'Meaning?', options: [{ id: 'right', label: 'Recovery' }, { id: 'wrong', label: 'Delay' }], correctOptionId: 'right',
};

describe('LearningDemoScreen', () => {
  it('returns to the product home through the supplied exit action', () => {
    const onExit = vi.fn();
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} onExit={onExit} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Back to home' }).props.onPress());
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('plays from image tap through meaning completion and restart', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const board = tree.root.findByProps({ testID: 'demo-board-A' });
    act(() => board.props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 100 } }));
    expect(tree.root.findByProps({ accessibilityLabel: 'Meaning quiz' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Answer input' }).props.onChangeText(' RESILIENCE '));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Submit answer' }).props.onPress());
    expect(tree.root.findByProps({ accessibilityLabel: 'Learning complete' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Play again' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' })).toBeTruthy();
  });

  it('keeps each board at the source image aspect ratio so tap coordinates stay aligned', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    expect(tree.root.findByProps({ testID: 'demo-board-A' }).props.style).toMatchObject({ width: '100%', aspectRatio: 1 });
    expect(tree.root.findByProps({ testID: 'demo-board-B' }).props.style).toMatchObject({ width: '100%', aspectRatio: 1 });
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
    act(() => tree.root.findByProps({ accessibilityLabel: 'Select stage 2 영어' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'demo-board-A' })).toBeTruthy();
    expect(tree.root.findAllByProps({ testID: 'claimed-A-d1' })).toHaveLength(0);
  });

  it('does not reveal the answer in the find phase header or lesson selector', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const visibleText = tree.root.findAllByType('Text').flatMap((node: any) => node.props.children).join(' ');
    const accessibility = tree.root.findAll(() => true).map((node: any) => node.props.accessibilityLabel).filter(Boolean).join(' ');
    expect(`${visibleText} ${accessibility}`.toLowerCase()).not.toContain('resilience');
  });

  it('offers a spelling pattern when casual content has hint units but no admitted ladder', () => {
    const spellingEntry = { ...entry, hintUnits: [...'resilience'] };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[spellingEntry]} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Use hint' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'current-hint' }).props.children).toContain('r _ _ _ _ _ _ _ _ _');
  });

  it('reveals the first admitted hint only after the player spends a hint', () => {
    const hintEntry = {
      ...entry,
      hintLadder: [{
        ordinal: 1,
        kind: 'SEMANTIC_CATEGORY',
        localizedText: { ko: '첫 번째 힌트', en: 'First hint' },
        revealIndexes: [],
        rankedPenaltyUnits: 1,
      }],
    } as LearningDemoEntry;
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[hintEntry]} />); });

    expect(tree.root.findAllByProps({ testID: 'current-hint' })).toHaveLength(0);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Use hint' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'current-hint' }).props.children).toBe('첫 번째 힌트');
    expect(tree.root.findByProps({ testID: 'hint-remaining' }).props.children).toBe(0);
  });
});
