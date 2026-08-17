import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { LearningDemoEntry } from './LearningDemoScreen.js';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const keyboardListeners = new Map<string, (event: { endCoordinates: { height: number } }) => void>();
vi.mock('react-native', () => ({
  Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
  // The letter flight degrades to nothing without measurement, which is what these host
  // stubs give it: `Animated.View` renders, no ref ever exposes `measureInWindow`.
  Animated: {
    View: 'Animated.View',
    Value: class { constructor(readonly value: number) {} setValue() {} interpolate() { return 0; } },
    timing: () => ({ start: (done?: () => void) => done?.() }),
  },
  Share: { share: vi.fn() },
  Keyboard: {
    addListener: (event: string, handler: (payload: { endCoordinates: { height: number } }) => void) => {
      keyboardListeners.set(event, handler);
      return { remove: () => keyboardListeners.delete(event) };
    },
  },
}));
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

  it('keeps every find when two taps land in the same batch', () => {
    // Reducing from the render closure lost finds the moment anyone tapped quickly: both
    // taps reduced from the same stale state and the second setState overwrote the first
    // one's claim. Nothing rewarded speed before the combo, so nobody hit it. Two taps
    // inside one act() is exactly that batch.
    const pair: LearningDemoEntry = {
      ...entry,
      key: 'pair',
      differences: [
        { id: 'left', imageA: { cx: .3, cy: .5, r: .15 }, imageB: { cx: .3, cy: .5, r: .15 } },
        { id: 'right', imageA: { cx: .7, cy: .5, r: .15 }, imageB: { cx: .7, cy: .5, r: .15 } },
      ],
    };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[pair]} />); });
    const board = tree.root.findByProps({ testID: 'demo-board-A' });
    act(() => board.props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } }));
    act(() => {
      const target = tree.root.findByProps({ testID: 'demo-board-A' });
      target.props.onPress({ nativeEvent: { locationX: 90, locationY: 100 } });
      target.props.onPress({ nativeEvent: { locationX: 210, locationY: 100 } });
    });
    // Both claims survived, so the board cleared and the quiz opened.
    expect(tree.root.findByProps({ accessibilityLabel: 'Meaning quiz' })).toBeTruthy();
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

    // A non-square pack must not be letterboxed, or normalized taps miss the artwork.
    const wide = { ...entry, key: 'wide', aspectRatio: 1536 / 1024 };
    let wideTree: any;
    act(() => { wideTree = create(<LearningDemoScreen entries={[wide]} />); });
    expect(wideTree.root.findByProps({ testID: 'demo-board-A' }).props.style).toMatchObject({ aspectRatio: 1.5 });
  });

  it('fits both boards in the visible area instead of making the player scroll between them', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const boards = tree.root.findByProps({ accessibilityLabel: 'Difference boards' });
    // Comparing the pair is the game; a scrollable board area would hide half of it.
    expect(boards.props.scrollEnabled).toBe(false);

    act(() => boards.props.onLayout({ nativeEvent: { layout: { width: 400, height: 600 } } }));
    const a = tree.root.findByProps({ testID: 'demo-board-A' }).props.style;
    const b = tree.root.findByProps({ testID: 'demo-board-B' }).props.style;
    expect(a).toEqual(b);
    // Height is the binding constraint here: (600 - gap) / 2 per board, not the 388 width.
    expect(a.height).toBeLessThanOrEqual((600 - 6) / 2);
    expect(a.width).toBe(a.height);
    expect(a.height * 2 + 6).toBeLessThanOrEqual(600);
  });

  it('lets a wide pack use the full width when height is not the limit', () => {
    const wide = { ...entry, key: 'wide', aspectRatio: 2 };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[wide]} />); });
    const boards = tree.root.findByProps({ accessibilityLabel: 'Difference boards' });
    act(() => boards.props.onLayout({ nativeEvent: { layout: { width: 400, height: 900 } } }));
    const a = tree.root.findByProps({ testID: 'demo-board-A' }).props.style;
    expect(a.width).toBe(388);
    expect(a.height).toBe(194);
  });

  it('draws claimed regions with the same normalized x and y radii used by hit testing', () => {
    const twoDifferences = { ...entry, differences: [...entry.differences, { id: 'd2', imageA: { cx: .2, cy: .2, r: .05 }, imageB: { cx: .2, cy: .2, r: .05 } }] };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[twoDifferences]} />); });
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 200 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 100 } }));
    expect(tree.root.findByProps({ testID: 'claimed-A-d1' }).props.style).toMatchObject({ width: '40%', height: '40%' });
  });

  it('keeps the category switcher off the board so the artwork gets the space', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry, { ...entry, key: 'two', title: 'dilemma' }]} />); });
    // Category is chosen on the home screen; an in-game switcher only steals board height.
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Content selection' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Select stage 2 영어' })).toHaveLength(0);
  });

  it('opens the pack matching the category chosen on the home screen', () => {
    const proverb = { ...entry, key: 'proverb', category: 'PROVERB' as const, title: '백문이 불여일견' };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry, proverb]} initialCategory="PROVERB" />); });
    // Stage number and category live in separate nodes now — the single header string ran out
    // of room next to the badges and truncated. Both halves still have to be right.
    expect(tree.root.findByProps({ accessibilityRole: 'header' }).props.children).toBe('레벨 2');
    expect(JSON.stringify(tree.toJSON())).toContain('속담');
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

  const twoDiff = {
    ...entry,
    key: 'two-diff',
    // Carries hint units so the deadline tests can assert the hint survives the buzzer.
    hintUnits: [...'resilience'],
    differences: [
      { id: 'd1', imageA: { cx: .5, cy: .5, r: .2 }, imageB: { cx: .5, cy: .5, r: .2 } },
      { id: 'd2', imageA: { cx: .1, cy: .1, r: .05 }, imageB: { cx: .1, cy: .1, r: .05 } },
    ],
  };

  it('turns the deadline into ten seconds for one last find', () => {
    vi.useFakeTimers();
    try {
      let tree: any;
      act(() => { tree = create(<LearningDemoScreen entries={[twoDiff]} />); });
      // Exactly to the buzzer, with a difference still on the board.
      act(() => { vi.advanceTimersByTime(75_000); });

      expect(tree.root.findByProps({ testID: 'sudden-death-banner' })).toBeTruthy();
      expect(tree.root.findByProps({ testID: 'hud-timer' }).props.children.props.children).toBe('SD 10');
      // The board is still the board: same differences, same places, one more chance.
      const board = tree.root.findByProps({ testID: 'demo-board-A' });
      act(() => board.props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } }));
      act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 150 } }));

      expect(tree.root.findByProps({ testID: 'quiz-status' }).props.children).toBe('SUDDEN DEATH');
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the board when the clock runs out and still lets the answer through', () => {
    vi.useFakeTimers();
    try {
      let tree: any;
      act(() => { tree = create(<LearningDemoScreen entries={[twoDiff]} />); });
      act(() => { vi.advanceTimersByTime(600_000); });

      // Being slow costs the differences that were never found — that is the whole cost.
      // It must never cost the learning, so the answer screen is what the buzzer leads to.
      expect(tree.root.findAllByProps({ testID: 'demo-board-A' })).toHaveLength(0);
      expect(tree.root.findByProps({ testID: 'quiz-status' }).props.children).toBe('TIME UP');
      expect(tree.root.findByProps({ accessibilityLabel: 'Answer input' })).toBeTruthy();
      // The hint outlives the board. Someone who ran out of time arrives here with nothing
      // revealed, so gating the hint on the finding stage would charge them the learning for
      // being slow. Found on device: the buzzer took the hint button with it.
      expect(tree.root.findByProps({ accessibilityLabel: 'Use hint' })).toBeTruthy();
      // ...but not a second answer field competing with the quiz screen's own.
      expect(tree.root.findAllByProps({ testID: 'early-answer' })).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('races a stored personal best and never calls it another player', () => {
    const memory = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    memory.set('touchcatch.ghost.v1:one', JSON.stringify({
      contentKey: 'one', solved: true, score: 90, finds: [{ id: 'd1', atMs: 0 }],
    }));

    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const badge = tree.root.findByProps({ testID: 'hud-ghost' });
    expect(badge.props.accessibilityLabel).toBe('내 기록 1개, 나 0개');
    // The ghost marker shows where the record was, and disappears once you match it.
    expect(tree.root.findAllByProps({ testID: 'ghost-A-d1' })).toHaveLength(1);

    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 150 } }));
    expect(tree.root.findAllByProps({ testID: 'ghost-A-d1' })).toHaveLength(0);
  });

  it('serves the same daily board to everyone and stamps its number', () => {
    const pack = (key: string, title: string) => ({ ...entry, key, title });
    const entries = [pack('a', 'alpha'), pack('b', 'bravo'), pack('c', 'charlie'), pack('d', 'delta'), pack('e', 'echo')];
    const header = (nowMs: number) => {
      let tree: any;
      act(() => { tree = create(<LearningDemoScreen entries={entries} daily nowMs={nowMs} />); });
      return tree.root.findByProps({ accessibilityRole: 'header' }).props.children;
    };

    // Same Seoul day, different clock readings: the board and its number must not move.
    expect(header(Date.parse('2026-08-13T00:10:00Z'))).toBe(header(Date.parse('2026-08-13T14:50:00Z')));
    expect(header(Date.parse('2026-08-13T03:00:00Z'))).toContain('오늘의 도전 #225');
    // 15:00 UTC is already tomorrow in Seoul.
    expect(header(Date.parse('2026-08-13T15:00:00Z'))).toContain('오늘의 도전 #226');
  });

  it('coaches through the first run without blocking the board', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const note = () => tree.root.findAllByProps({ testID: 'coach-note' })[0];

    expect(note().props.accessibilityLabel).toBe('두 그림에서 다른 곳을 찾아 눌러 보세요');
    // A note the player must tap away is a note in the way of the game.
    expect(note().props.pointerEvents).toBe('none');

    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 150 } }));
    // One difference clears the board, so the run ends and coaching goes quiet.
    expect(tree.root.findAllByProps({ testID: 'coach-note' })).toHaveLength(0);
  });

  it('offers a shareable result that does not spoil the answer', async () => {
    const { Share } = await import('react-native') as unknown as { Share: { share: ReturnType<typeof vi.fn> } };
    Share.share.mockClear();

    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 150 } }));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Answer input' }).props.onChangeText('resilience'));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Submit answer' }).props.onPress());

    act(() => tree.root.findByProps({ accessibilityLabel: 'Share result' }).props.onPress());
    expect(Share.share).toHaveBeenCalledOnce();
    const message: string = Share.share.mock.calls[0]![0].message;
    expect(message).toContain('🔍');
    // The card leaves the app, so the answer must never be inside it.
    expect(message.toLowerCase()).not.toContain('resilience');
  });

  it('shows how the final score was reached', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 150 } }));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Answer input' }).props.onChangeText('resilience'));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Submit answer' }).props.onPress());

    // Without a breakdown the player cannot tell what to do differently next run.
    const rows = tree.root.findByProps({ testID: 'score-breakdown' })
      .findAllByType('Text').map((node: any) => node.props.children).join(' ');
    expect(rows).toContain('차이점 1/1');
    expect(rows).toContain('빠른 풀이 보너스');
  });

  it('draws the answer mask as one slot per unit so a letter can land in one', () => {
    const proverb = {
      ...entry, key: 'p', category: 'PROVERB' as const, assistPattern: 'INITIAL_PATTERN' as const, title: '백문이 불여일견',
      // Enough differences that the reveal rate floors at one unit per find. This test is
      // about the slot structure and a single letter landing in a single slot, and under
      // SCALE_TO_COVER a two-difference board on a seven-syllable answer opens seven units
      // at once — correct behaviour, but it would leave nothing here to demonstrate.
      differences: [
        ...entry.differences,
        ...Array.from({ length: 13 }, (_unused, index) => ({
          id: `d${index + 2}`,
          imageA: { cx: .05 + index * .06, cy: .1, r: .02 },
          imageB: { cx: .05 + index * .06, cy: .1, r: .02 },
        })),
      ],
    };
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[proverb]} initialCategory="PROVERB" />); });

    const slots = () => tree.root.findByProps({ testID: 'hud-pattern' }).children
      .filter((child: any) => typeof child !== 'string' && typeof child.props?.testID === 'string');
    // Seven syllables plus one gap, and the gap is not a slot: index 3 is skipped.
    expect(slots().map((slot: any) => slot.props.testID)).toEqual([
      'pattern-slot-0', 'pattern-slot-1', 'pattern-slot-2',
      'pattern-slot-4', 'pattern-slot-5', 'pattern-slot-6', 'pattern-slot-7',
    ]);
    const slotText = (index: number) => slots()
      .find((slot: any) => slot.props.testID === `pattern-slot-${index}`)
      .findByType('Text').props.children;
    expect(slotText(0)).toBe('');
    expect(slotText(7)).toBe('');

    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 300 } } }));
    act(() => tree.root.findByProps({ testID: 'demo-board-A' }).props.onPress({ nativeEvent: { locationX: 150, locationY: 150 } }));
    // No measurement in this host, so the flight is skipped and the slot fills immediately.
    expect(slotText(0)).toBe('ㅂ');
    expect(slotText(1)).toBe('');
  });

  it('reserves the keyboard height so the answer bar stays reachable', () => {
    let tree: any;
    act(() => { tree = create(<LearningDemoScreen entries={[entry]} />); });
    const screen = () => tree.root.findByProps({ accessibilityLabel: 'Learning spot the difference' }).props.style;
    expect(screen().paddingBottom).toBe(0);

    // Android edge-to-edge defeats adjustResize, so an unpadded layout hides the submit button.
    act(() => keyboardListeners.get('keyboardDidShow')!({ endCoordinates: { height: 320 } }));
    expect(screen().paddingBottom).toBe(320);
    act(() => keyboardListeners.get('keyboardDidHide')!({ endCoordinates: { height: 0 } }));
    expect(screen().paddingBottom).toBe(0);
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
