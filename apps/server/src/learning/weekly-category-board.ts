import { parseWeeklyCategoryBoardResponseV1, type RankedCategoryV1, type WeeklyCategoryBoardResponseV1 } from '../../../../packages/contracts/src/learning-leaderboard.js';
import type { MobileRpcClient } from '../database/pg-rpc.js';

export type WeeklyCategoryBoardInput = Readonly<{ subjectKey: string; seasonId: string; category: RankedCategoryV1; limit: number }>;
export interface WeeklyCategoryBoardRepository { read(input: WeeklyCategoryBoardInput): Promise<WeeklyCategoryBoardResponseV1> }

export class PostgresWeeklyCategoryBoard implements WeeklyCategoryBoardRepository {
  constructor(private readonly rpc: MobileRpcClient) {}
  async read(input: WeeklyCategoryBoardInput): Promise<WeeklyCategoryBoardResponseV1> {
    return this.rpc.callParsed('read_weekly_category_board_v1', [input.subjectKey, input.seasonId, input.category, input.limit], parseWeeklyCategoryBoardResponseV1);
  }
}
