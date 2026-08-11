import { MobileApiError } from '../../api/mobile-api-transport';
import { buildRankingModel, type RankedCategory, type RankingModel } from './ranking-model';
import type { createRankingClient, WeeklyBoardResponse } from './ranking-client';

type RankingClient = ReturnType<typeof createRankingClient>;
type SessionStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';
export type RankingRouteState = Readonly<{
  category: RankedCategory;
  model: RankingModel;
  board: WeeklyBoardResponse | null;
  reason?: 'SIGNED_OUT' | string;
}>;

export function createRankingRouteController(input: Readonly<{
  session(): SessionStatus;
  seasonId: string;
  client: RankingClient;
}>) {
  let disposed = false;
  let requestRevision = 0;
  const boards = new Map<RankedCategory, WeeklyBoardResponse>();
  const listeners = new Set<(state: RankingRouteState) => void>();
  let state: RankingRouteState = {
    category: 'ENGLISH',
    model: buildRankingModel({ category: 'ENGLISH', rows: [], enabled: false }),
    board: null,
    ...(input.session() === 'signed-in' ? {} : { reason: 'SIGNED_OUT' as const }),
  };
  const publish = (next: RankingRouteState) => {
    if (disposed) return;
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  return {
    getState: () => state,
    subscribe(listener: (value: RankingRouteState) => void) {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async load(category: RankedCategory) {
      const revision = ++requestRevision;
      if (input.session() !== 'signed-in') {
        boards.clear();
        publish({ category, model: buildRankingModel({ category, rows: [], enabled: false }), board: null, reason: 'SIGNED_OUT' });
        return;
      }
      const previous = boards.get(category) ?? null;
      publish({ category, model: buildRankingModel({ category, rows: [], enabled: true, requestState: 'LOADING' }), board: previous });
      try {
        const board = await input.client.getWeeklyBoard({ seasonId: input.seasonId, category, limit: 10 });
        if (revision !== requestRevision || disposed) return;
        if (input.session() !== 'signed-in') {
          publish({ category, model: buildRankingModel({ category, rows: [], enabled: false }), board: null, reason: 'SIGNED_OUT' });
          return;
        }
        boards.set(category, board);
        publish({ category, model: buildRankingModel({ category, rows: board.rows, enabled: true }), board });
      } catch (error) {
        if (revision !== requestRevision || disposed) return;
        if (input.session() !== 'signed-in') {
          publish({ category, model: buildRankingModel({ category, rows: [], enabled: false }), board: null, reason: 'SIGNED_OUT' });
          return;
        }
        const code = error instanceof MobileApiError || error instanceof Error ? error.message : 'UNKNOWN_ERROR';
        if (['RANKING_POLICY_NOT_APPROVED', 'POLICY_MISMATCH'].includes(code)) {
          publish({ category, model: buildRankingModel({ category, rows: [], enabled: false }), board: null, reason: code });
        } else if (previous) {
          publish({ category, model: buildRankingModel({ category, rows: previous.rows, enabled: true, stale: true }), board: previous, reason: code });
        } else {
          publish({ category, model: buildRankingModel({ category, rows: [], enabled: true, requestState: 'ERROR' }), board: null, reason: code });
        }
      }
    },
    dispose() { disposed = true; requestRevision += 1; boards.clear(); listeners.clear(); },
  } as const;
}
