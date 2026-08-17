import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { PetCollection } from './PetCollection.js';

vi.mock('react-native', () => ({ Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('PetCollection', () => {
  it.each([
    ['LOADING', '펫 컬렉션 로딩 중'],
    ['EMPTY', '펫 컬렉션 비어 있음'],
    ['ERROR', '펫 컬렉션 오류'],
  ] as const)('renders the %s state', (status, label) => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetCollection status={status} pets={[]} totalCatalogCount={3} />); });
    expect(tree.root.findByProps({ accessibilityLabel: label })).toBeTruthy();
  });

  it('shows rarity, copies, and promotion only at the 11-copy boundary', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetCollection pets={[
      { id: 'ready', name: '코코', rarity: 'RARE', ownedCopies: 11 },
      { id: 'locked', name: '루나', rarity: 'LEGENDARY', ownedCopies: 10, artUrl: 'https://cdn.example/luna.png' },
    ]} totalCatalogCount={2} />); });
    expect(tree.root.findAllByProps({ accessibilityLabel: '코코 승급' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: '루나 승급' })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: '루나 펫 이미지' }).props.source).toEqual({ uri: 'https://cdn.example/luna.png' });
  });

  it('groups inventory rows by pet and only offers promotion with ten eligible spare copies', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetCollection pets={[
      { id: 'cat', name: '코코', rarity: 'COMMON', ownedCopies: 1, selected: true },
      { id: 'cat', name: '코코', rarity: 'COMMON', ownedCopies: 10 },
      { id: 'cat', name: '코코', rarity: 'COMMON', ownedCopies: 3, locked: true },
      { id: 'dog', name: '보리', rarity: 'COMMON', ownedCopies: 9 },
      { id: 'dog', name: '보리', rarity: 'COMMON', ownedCopies: 2, locked: true },
    ]} totalCatalogCount={50} />); });

    expect(tree.root.findAllByProps({ accessibilityLabel: '코코 펫 카드' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: '보리 펫 카드' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: '코코 승급' })).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: '보리 승급' })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: '펫 수집률' }).children.join('')).toBe('수집률 4% (2/50)');
    expect(tree.root.findByProps({ accessibilityLabel: '코코 보유 수량' }).children.join('')).toBe('보유: 14개');
    // 보리 holds eleven but two are locked, so a spare is what is missing. The meter reads the
    // binding constraint and names the tier being climbed to — "one more" means nothing on its own.
    expect(tree.root.findAllByProps({ accessibilityLabel: '보리 고급 승급까지 1개, 10/11' })).toHaveLength(1);
  });

  it('shows the ceiling as a meter, and shows none at the top of the ladder', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<PetCollection pets={[
      { id: 'far', name: '나비', rarity: 'COMMON', ownedCopies: 2 },
      { id: 'top', name: '루나', rarity: 'LEGENDARY', ownedCopies: 4 },
    ]} totalCatalogCount={2} />); });

    expect(tree.root.findAllByProps({ accessibilityLabel: '나비 고급 승급까지 9개, 2/11' })).toHaveLength(1);
    // LEGENDARY has nothing above it, so it gets no meter rather than one that can never fill.
    expect(tree.root.findAllByProps({ accessibilityLabel: '루나 전설 승급까지 7개, 4/11' })).toHaveLength(0);
    expect(tree.root.findByProps({ accessibilityLabel: '루나 펫 카드' })).toBeTruthy();
  });
});
