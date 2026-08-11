import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import RankingRoute, { RankingRouteView } from '../../app/ranking.js';
import { buildRankingModel } from '../features/ranking/ranking-model.js';
import { createRankingRouteController } from '../features/ranking/ranking-route-controller.js';
import { useMobileRuntime, useMobileSession } from '../runtime/mobile-runtime.js';

vi.mock('react-native', () => ({ ScrollView: 'ScrollView', Text: 'Text', View: 'View', Pressable: 'Pressable' }));
vi.mock('../runtime/mobile-runtime', () => ({ useMobileRuntime: vi.fn(), useMobileSession: vi.fn() }));
vi.mock('../features/ranking/ranking-route-controller', async () => {
  const actual = await vi.importActual<typeof import('../features/ranking/ranking-route-controller.js')>('../features/ranking/ranking-route-controller.js');
  return { ...actual, createRankingRouteController: vi.fn() };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ranking live route view', () => {
  it('renders server-backed rows and category controls', () => {
    const state = {
      category: 'ENGLISH' as const,
      board: { seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH' as const, snapshotRevision: 'db:1', rows: [{ rank: 1, nickname: 'Ada', score: 9000, verified: true }], myRank: { rank: 8, totalCompetitors: 100, percentile: 8, displayScore: 7000 } },
      model: buildRankingModel({ category: 'ENGLISH', enabled: true, rows: [{ rank: 1, nickname: 'Ada', score: 9000, verified: true }] }),
    };
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<RankingRouteView state={state} onCategory={vi.fn()} onRetry={vi.fn()} />); });
    expect(tree.root.findByProps({ accessibilityLabel: '랭킹 상태 READY' })).toBeTruthy();
    expect(tree.root.findByProps({ accessibilityLabel: '1위 Ada 9000점' })).toBeTruthy();
    expect(JSON.stringify(tree.toJSON())).toContain('내 주간 순위: ');
  });

  it('hides a cached board synchronously on the render that observes sign-out', () => {
    const cached = {
      category: 'ENGLISH' as const,
      board: { seasonId: '30000000-0000-4000-8000-000000000001', category: 'ENGLISH' as const, snapshotRevision: 'db:1', rows: [{ rank: 1, nickname: 'Previous User', score: 9000, verified: true }], myRank: { rank: 1, totalCompetitors: 10, percentile: 100, displayScore: 9000 } },
      model: buildRankingModel({ category: 'ENGLISH', enabled: true, rows: [{ rank: 1, nickname: 'Previous User', score: 9000, verified: true }] }),
    };
    const controller = { getState: () => cached, subscribe: () => () => undefined, load: vi.fn(), dispose: vi.fn() };
    vi.mocked(createRankingRouteController).mockReturnValue(controller as never);
    vi.mocked(useMobileRuntime).mockReturnValue({ status: 'READY', environment: { weeklySeasonId: cached.board.seasonId }, ranking: {}, session: { getState: () => ({ status: 'signed-in' }) } } as never);
    vi.mocked(useMobileSession).mockReturnValue({ status: 'signed-in' } as never);
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<RankingRoute />); });
    expect(JSON.stringify(tree.toJSON())).toContain('Previous User');

    vi.mocked(useMobileSession).mockReturnValue({ status: 'signed-out' } as never);
    act(() => { tree.update(<RankingRoute />); });
    expect(JSON.stringify(tree.toJSON())).not.toContain('Previous User');
    expect(tree.root.findByProps({ accessibilityLabel: '랭킹 상태 DISABLED' })).toBeTruthy();
  });
});
