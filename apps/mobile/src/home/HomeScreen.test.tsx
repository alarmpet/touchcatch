import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { buildHomeModel } from './home-model';

vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HomeScreen', () => {
  it('does not create a game link when learning content is unavailable', () => {
    const model = buildHomeModel({ hasAdmittedContent: false, serverAvailable: true, rewardPolicy: 'APPROVED', rankingEnabled: true });
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HomeScreen model={model} />); });
    expect(tree.root.findAllByProps({ accessibilityLabel: '오늘의 학습 준비 중' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ href: '/game/spot-difference' })).toHaveLength(0);
  });
});
