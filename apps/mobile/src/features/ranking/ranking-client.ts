import type { RankingRow, RankedCategory } from './ranking-model.js';
import {
  parseWeeklyCategoryBoardResponseV1,
  weeklyLeaderboardQueryV1Schema,
  type WeeklyMyRankV1,
} from '../../../../../packages/contracts/src/learning-leaderboard.js';

export type RankingClientRequest = Readonly<{
  method: 'GET';
  path: string;
}>;

export type RankingClientTransport = Readonly<{
  request<T>(request: RankingClientRequest): Promise<T>;
}>;

export type WeeklyBoardResponse = Readonly<{
  seasonId: string;
  category: RankedCategory;
  snapshotRevision: string;
  rows: readonly RankingRow[];
  myRank: WeeklyMyRankV1 | null;
}>;

const admittedCategories = new Set<RankedCategory>(['ENGLISH', 'PROVERB']);

function parseResponse(value: unknown, expectedSeason: string, expectedCategory: RankedCategory): WeeklyBoardResponse {
  let parsed;
  try {
    parsed = parseWeeklyCategoryBoardResponseV1(value);
  } catch {
    throw new Error('RANKING_RESPONSE_INVALID');
  }
  if (parsed.seasonId !== expectedSeason || parsed.category !== expectedCategory) {
    throw new Error('RANKING_RESPONSE_INVALID');
  }

  const rows = parsed.rows.map((candidate): RankingRow => ({
      rank: candidate.rank,
      nickname: candidate.nickname,
      score: candidate.displayScore,
      verified: true,
      contentAdmitted: true,
      hintPenaltyVerified: true,
    }));

  return {
    seasonId: expectedSeason,
    category: expectedCategory,
    snapshotRevision: parsed.snapshotRevision,
    rows,
    myRank: parsed.myRank,
  };
}

export function createRankingClient(transport: RankingClientTransport) {
  return {
    async getWeeklyBoard(input: Readonly<{
      seasonId: string;
      category: string;
      limit?: number;
    }>): Promise<WeeklyBoardResponse> {
      if (!admittedCategories.has(input.category as RankedCategory)) {
        throw new Error('RANKING_CATEGORY_NOT_ADMITTED');
      }
      const category = input.category as RankedCategory;
      const limit = input.limit ?? 10;
      const queryInput = weeklyLeaderboardQueryV1Schema.safeParse({
        seasonId: input.seasonId,
        category,
        limit,
      });
      if (!queryInput.success) {
        const field = queryInput.error.issues[0]?.path[0];
        throw new Error(field === 'limit' ? 'RANKING_LIMIT_INVALID' : 'RANKING_SEASON_INVALID');
      }
      const { seasonId } = queryInput.data;
      const query = `seasonId=${encodeURIComponent(seasonId)}&category=${category}&limit=${limit}`;
      const response = await transport.request<unknown>({
        method: 'GET',
        path: `/v1/learning/leaderboard?${query}`,
      });
      return parseResponse(response, seasonId, category);
    },
  } as const;
}
