import { describe, expect, it, vi } from 'vitest';
import { createRankingClient } from './ranking-client.js';

describe('ranking client boundary', () => {
  const seasonId = '30000000-0000-4000-8000-000000000001';

  it('requests only an admitted weekly category and maps public server rows', async () => {
    const request = vi.fn().mockResolvedValue({
      seasonId,
      category: 'ENGLISH',
      snapshotRevision: 'db:season:english:1',
      rows: [{ rank: 1, nickname: 'Ada', displayScore: 9200 }],
      myRank: { rank: 8, totalCompetitors: 120, percentile: 6.67, displayScore: 8100 },
    });

    const result = await createRankingClient({ request }).getWeeklyBoard({
      seasonId,
      category: 'ENGLISH',
      limit: 10,
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      path: `/v1/learning/leaderboard?seasonId=${seasonId}&category=ENGLISH&limit=10`,
    });
    expect(result.rows).toEqual([{
      rank: 1,
      nickname: 'Ada',
      score: 9200,
      verified: true,
      contentAdmitted: true,
      hintPenaltyVerified: true,
    }]);
    expect(result.myRank).toEqual({
      rank: 8,
      totalCompetitors: 120,
      percentile: 6.67,
      displayScore: 8100,
    });
  });

  it('fails closed for categories outside the approved weekly allow-list', async () => {
    const request = vi.fn();
    await expect(createRankingClient({ request }).getWeeklyBoard({
      seasonId,
      category: 'IDIOM',
    })).rejects.toThrow('RANKING_CATEGORY_NOT_ADMITTED');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects malformed or private-looking transport rows', async () => {
    for (const privateField of [
      { subjectKey: 'private-subject' },
      { userId: 'private-user-id' },
      { email: 'private@example.test' },
      { coordinates: [{ x: 0.1, y: 0.2 }] },
      { hitboxes: [{ x: 0, y: 0, width: 1, height: 1 }] },
    ]) {
      const request = vi.fn().mockResolvedValue({
        seasonId,
        category: 'PROVERB',
        snapshotRevision: 'db:season:proverb:1',
        rows: [{ rank: 1, nickname: 'Ada', displayScore: 1, ...privateField }],
        myRank: null,
      });
      await expect(createRankingClient({ request }).getWeeklyBoard({
        seasonId,
        category: 'PROVERB',
      })).rejects.toThrow('RANKING_RESPONSE_INVALID');
    }
  });

  it('rejects private or unknown fields in myRank and the response envelope', async () => {
    for (const payload of [
      {
        seasonId,
        category: 'ENGLISH',
        snapshotRevision: 'db:season:english:1',
        rows: [],
        myRank: null,
        userId: 'private-auth-id',
      },
      {
        seasonId,
        category: 'ENGLISH',
        snapshotRevision: 'db:season:english:1',
        rows: [],
        myRank: { rank: 1, totalCompetitors: 1, percentile: 100, displayScore: 10, email: 'private@example.test' },
      },
    ]) {
      const request = vi.fn().mockResolvedValue(payload);
      await expect(createRankingClient({ request }).getWeeklyBoard({
        seasonId,
        category: 'ENGLISH',
      })).rejects.toThrow('RANKING_RESPONSE_INVALID');
    }
  });

  it('rejects non-UUID seasons and limits outside the public contract before transport', async () => {
    const request = vi.fn();
    await expect(createRankingClient({ request }).getWeeklyBoard({
      seasonId: 'season-1',
      category: 'ENGLISH',
    })).rejects.toThrow('RANKING_SEASON_INVALID');
    for (const limit of [0, 1.5, 11]) {
      await expect(createRankingClient({ request }).getWeeklyBoard({
        seasonId,
        category: 'ENGLISH',
        limit,
      })).rejects.toThrow('RANKING_LIMIT_INVALID');
    }
    expect(request).not.toHaveBeenCalled();
  });
});
