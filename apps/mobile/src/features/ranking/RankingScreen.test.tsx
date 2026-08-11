import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { RankingScreen } from './RankingScreen.js';

vi.mock('react-native', () => ({ Text: 'Text', View: 'View' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('RankingScreen', () => {
  it.each(['LOADING', 'EMPTY', 'STALE', 'ERROR', 'DISABLED'] as const)(
    'renders the %s state accessibly',
    (state) => {
      let tree!: ReturnType<typeof create>;
      act(() => { tree = create(<RankingScreen model={{ state, rows: [], totalRows: 0 }} />); });
      expect(tree.root.findByProps({ accessibilityLabel: `랭킹 상태 ${state}` })).toBeTruthy();
    },
  );
});
