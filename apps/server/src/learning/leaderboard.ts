export type ChallengeLeaderboardQuery = {
  seasonId: string;
  contentRevisionId: string;
  limit?: number;
  subjectKey?: string;
};

export type PublicLeaderboardEntry = {
  rank: number;
  nickname: string;
  petCatalogId: string;
  displayScore: number;
  completionMs: number;
  hintsUsed: number;
  wrongTaps: number;
  wrongAnswers: number;
};

export type ChallengeLeaderboardResult = {
  seasonId: string;
  contentRevisionId: string;
  snapshotRevision: string;
  top10: PublicLeaderboardEntry[];
  myRank?: {
    rank: number;
    totalCompetitors: number;
    percentile: number;
    displayScore: number;
  };
};

export type LeaderboardRow = PublicLeaderboardEntry;

export type LeaderboardReadProvider = {
  readRows(query: ChallengeLeaderboardQuery): Promise<LeaderboardRow[]>;
  readMyRank?(query: ChallengeLeaderboardQuery): Promise<NonNullable<ChallengeLeaderboardResult['myRank']> | undefined>;
};

export function createSqlLeaderboardProvider(rpc: SqlRpcClient): LeaderboardReadProvider {
  return {
    async readRows(query) {
      const rows = await rpc.call<LeaderboardRow[]>('public.read_learning_leaderboard_v1', {
        season_id: query.seasonId,
        content_revision_id: query.contentRevisionId,
        limit: Math.min(query.limit ?? 10, 10),
      });
      return rows.map(({ rank, nickname, petCatalogId, displayScore, completionMs, hintsUsed, wrongTaps, wrongAnswers }) => ({
        rank, nickname, petCatalogId, displayScore, completionMs, hintsUsed, wrongTaps, wrongAnswers,
      }));
    },
    async readMyRank(query) {
      if (!query.subjectKey) return undefined;
      return rpc.call('public.read_learning_subject_rank_v1', {
        season_id: query.seasonId,
        content_revision_id: query.contentRevisionId,
        subject_key: query.subjectKey,
      });
    },
  };
}

export class LeaderboardAdapter {
  constructor(private readonly provider?: LeaderboardReadProvider) {}

  async getChallengeLeaderboard(query: ChallengeLeaderboardQuery): Promise<ChallengeLeaderboardResult> {
    if (!this.provider) throw new Error('LEADERBOARD_PROVIDER_NOT_CONFIGURED');
    const rows = await this.provider.readRows(query);
    const result: ChallengeLeaderboardResult = {
      seasonId: query.seasonId,
      contentRevisionId: query.contentRevisionId,
      snapshotRevision: `db:${query.seasonId}:${query.contentRevisionId}`,
      top10: rows.slice(0, Math.min(query.limit ?? 10, 10)),
    };
    if (query.subjectKey && this.provider.readMyRank) {
      const myRank = await this.provider.readMyRank(query);
      if (myRank) result.myRank = myRank;
    }
    return result;
  }
}
import type { SqlRpcClient } from './sql-rpc-client.js';
