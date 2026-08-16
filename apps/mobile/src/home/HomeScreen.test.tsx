import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { buildHomeModel } from './home-model';

vi.mock('expo-router', () => ({ Link: 'Link' }));
vi.mock('react-native', () => ({
  Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
  // The entrance animation degrades to a plain host component here: `Animated.View` renders,
  // the timing driver completes immediately, so assertions see the finished screen.
  Animated: {
    View: 'Animated.View',
    Value: class { constructor(readonly value: number) {} setValue() {} interpolate() { return 0; } },
    timing: () => ({ start: (done?: () => void) => done?.(), stop: () => {} }),
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HomeScreen', () => {
  it('does not create a game link when learning content is unavailable', () => {
    const model = buildHomeModel({ hasAdmittedContent: false, serverAvailable: true, rewardPolicy: 'APPROVED', rankingEnabled: true });
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HomeScreen model={model} />); });
    expect(tree.root.findAllByProps({ accessibilityLabel: '오늘의 학습 준비 중' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ href: '/game/spot-difference' })).toHaveLength(0);
  });

  it('shows the collection as slots to fill and never leaks private inventory fields', () => {
    const model = {
      ...buildHomeModel({ hasAdmittedContent: true, serverAvailable: true, rewardPolicy: 'APPROVED' as const, rankingEnabled: true }),
      collection: {
        ownedCount: 2,
        totalCount: 50,
        showcase: [
          { petId: 'p1', displayKey: 'pet.common.lion', rarity: 'COMMON', thumbnailUrl: 'https://cdn.example/a.png' },
          { petId: 'p2', displayKey: 'pet.rare.deer', rarity: 'RARE', thumbnailUrl: 'https://cdn.example/b.png' },
        ],
      },
    };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HomeScreen model={model} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '내 펫 2마리, 전체 50종' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '일반 펫' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: '희귀 펫' })).toHaveLength(1);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/userPetId|subjectKey|copies/);
  });

  it('renders empty slots rather than nothing before the first pet arrives', () => {
    const model = buildHomeModel({ hasAdmittedContent: true, serverAvailable: true, rewardPolicy: 'APPROVED' as const, rankingEnabled: true });
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<HomeScreen model={model} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '내 펫 0마리, 전체 0종' })).toBeTruthy();
    expect(tree.root.findAllByProps({ accessibilityLabel: '일반 펫' })).toHaveLength(0);
  });
});
