import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicSettingsCard } from './MusicSettingsCard';
import { MusicProvider } from './music-context';
import { DEFAULT_MUSIC_SETTINGS } from './music-model';

vi.mock('react-native', () => ({ Pressable: 'Pressable', Text: 'Text', View: 'View' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = 'touchcatch.music.settings.v1';

function withStorage() {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
  return map;
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

function render() {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<MusicProvider><MusicSettingsCard /></MusicProvider>); });
  return tree;
}

function press(tree: ReturnType<typeof create>, label: string) {
  act(() => { tree.root.findByProps({ accessibilityLabel: label }).props.onPress(); });
}

describe('music settings card', () => {
  it('opens on the stored default, with music on', () => {
    withStorage();
    const tree = render();
    expect(tree.root.findByProps({ accessibilityLabel: '배경음악' }).props.accessibilityState).toEqual({ checked: true });
    expect(tree.root.findByProps({ accessibilityLabel: '음량 보통' }).props.accessibilityState)
      .toEqual({ selected: true, disabled: false });
  });

  it('turns music off and remembers it', () => {
    const store = withStorage();
    const tree = render();
    press(tree, '배경음악');
    expect(tree.root.findByProps({ accessibilityLabel: '배경음악' }).props.accessibilityState).toEqual({ checked: false });
    expect(JSON.parse(store.get(KEY) ?? '{}')).toMatchObject({ enabled: false });
  });

  it('disables the volume steps while music is off, so the control cannot lie', () => {
    withStorage();
    const tree = render();
    press(tree, '배경음악');
    for (const label of ['음량 작게', '음량 보통', '음량 크게']) {
      const step = tree.root.findByProps({ accessibilityLabel: label });
      expect(step.props.accessibilityState).toEqual({ selected: false, disabled: true });
    }
  });

  it('changes volume and remembers it', () => {
    const store = withStorage();
    const tree = render();
    press(tree, '음량 크게');
    expect(tree.root.findByProps({ accessibilityLabel: '음량 크게' }).props.accessibilityState)
      .toEqual({ selected: true, disabled: false });
    expect(JSON.parse(store.get(KEY) ?? '{}')).toMatchObject({ volume: 0.6 });
  });

  it('keeps the volume choice through an off/on cycle', () => {
    withStorage();
    const tree = render();
    press(tree, '음량 작게');
    press(tree, '배경음악');
    press(tree, '배경음악');
    expect(tree.root.findByProps({ accessibilityLabel: '음량 작게' }).props.accessibilityState)
      .toEqual({ selected: true, disabled: false });
  });

  it('renders silently outside the provider rather than throwing', () => {
    // Every screen test mounts without one; the no-op default has to hold.
    let tree!: ReturnType<typeof create>;
    expect(() => { act(() => { tree = create(<MusicSettingsCard />); }); }).not.toThrow();
    expect(tree.root.findByProps({ accessibilityLabel: '배경음악' }).props.accessibilityState)
      .toEqual({ checked: DEFAULT_MUSIC_SETTINGS.enabled });
  });
});
