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
});
