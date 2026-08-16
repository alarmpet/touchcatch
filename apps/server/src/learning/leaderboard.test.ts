import { describe, it, expect } from 'vitest';
import { LeaderboardAdapter, ChallengeLeaderboardQuery, type LeaderboardRow } from './leaderboard.js';
import { createSqlRpcClient } from './sql-rpc-client.js';
import { createSqlLeaderboardProvider } from './leaderboard.js';

describe('LeaderboardAdapter', () => {
  it('fetches leaderboard entries from snapshot without exposing private identifiers', async () => {
    const rows: LeaderboardRow[] = [{
      rank: 1, nickname: 'Verified player', petCatalogId: 'pet-catalog-1', displayScore: 95000,
      completionMs: 25000, hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0,
    }];
    const adapter = new LeaderboardAdapter({
      async readRows() { return rows; },
      async readMyRank() { return { rank: 1, totalCompetitors: 1, percentile: 1, displayScore: 95000 }; },
    });
    const query: ChallengeLeaderboardQuery = {
      seasonId: 'season-2026-w31',
      contentRevisionId: 'rev-1',
      limit: 10,
    };

    const board = await adapter.getChallengeLeaderboard(query);

    expect(board.top10).toHaveLength(1);
    expect(board.top10[0]?.nickname).toBe('Verified player');
    expect(board.top10[0]).not.toHaveProperty('subjectKey');
  });

  it('does not fabricate leaderboard data when no DB provider is configured', async () => {
    await expect(new LeaderboardAdapter().getChallengeLeaderboard({
      seasonId: 'season-2026-w31', contentRevisionId: 'rev-1',
    })).rejects.toThrow('LEADERBOARD_PROVIDER_NOT_CONFIGURED');
  });

  it('reads only public leaderboard fields through SQL RPC', async () => {
    const rpc = createSqlRpcClient(async (name) => name === 'public.read_learning_leaderboard_v1'
      ? [{ rank: 1, nickname: 'N', petCatalogId: 'pet', displayScore: 10, completionMs: 100, hintsUsed: 0, wrongTaps: 0, wrongAnswers: 0, subjectKey: 'private' }]
      : undefined);
    const board = await new LeaderboardAdapter(createSqlLeaderboardProvider(rpc)).getChallengeLeaderboard({ seasonId: 's', contentRevisionId: 'r' });
    expect(board.top10[0]).toEqual(expect.objectContaining({ nickname: 'N' }));
    expect(board.top10[0]).not.toHaveProperty('subjectKey');
  });
});
