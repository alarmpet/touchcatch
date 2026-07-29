export type BoardSide = 'A' | 'B';
export type AssetStatus = 'LOADING' | 'READY' | 'FAILED';
export type AssetState = Readonly<Record<BoardSide, AssetStatus>>;
export type AssetAction =
  | Readonly<{ type: 'READY'; side: BoardSide }>
  | Readonly<{ type: 'FAILED'; side: BoardSide }>
  | Readonly<{ type: 'RETRY' }>;

export function createAssetState(): AssetState {
  return { A: 'LOADING', B: 'LOADING' };
}

export function canAcceptBoardTap(state: AssetState): boolean {
  return state.A === 'READY' && state.B === 'READY';
}

export function reduceAssetState(state: AssetState, action: AssetAction): AssetState {
  switch (action.type) {
    case 'READY':
      return { ...state, [action.side]: 'READY' };
    case 'FAILED':
      return { ...state, [action.side]: 'FAILED' };
    case 'RETRY':
      return createAssetState();
  }
}
