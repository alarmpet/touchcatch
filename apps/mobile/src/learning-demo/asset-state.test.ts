import { describe, expect, it } from 'vitest';
import { canAcceptBoardTap, createAssetState, reduceAssetState } from './asset-state.js';

describe('board asset lifecycle', () => {
  it('requires both images before accepting a tap', () => {
    const initial = createAssetState();
    expect(initial).toEqual({ A: 'LOADING', B: 'LOADING' });
    const oneReady = reduceAssetState(initial, { type: 'READY', side: 'A' });
    expect(oneReady).toEqual({ A: 'READY', B: 'LOADING' });
    expect(canAcceptBoardTap(oneReady)).toBe(false);
    expect(canAcceptBoardTap({ A: 'READY', B: 'READY' })).toBe(true);
  });

  it('records failure and resets both sides for retry', () => {
    expect(reduceAssetState(createAssetState(), { type: 'FAILED', side: 'B' }))
      .toEqual({ A: 'LOADING', B: 'FAILED' });
    expect(reduceAssetState({ A: 'FAILED', B: 'READY' }, { type: 'RETRY' }))
      .toEqual({ A: 'LOADING', B: 'LOADING' });
  });
});
