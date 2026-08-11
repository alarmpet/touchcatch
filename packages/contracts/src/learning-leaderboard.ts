import { z } from 'zod';

export const rankedCategoryV1Schema = z.enum(['ENGLISH', 'PROVERB']);

export const weeklyLeaderboardQueryV1Schema = z.object({
  seasonId: z.uuid(),
  category: rankedCategoryV1Schema,
  limit: z.number().int().min(1).max(10),
}).strict();

export const publicWeeklyRankingRowV1Schema = z.object({
  rank: z.number().int().positive(),
  nickname: z.string().trim().min(1).max(32),
  displayScore: z.number().int().nonnegative(),
}).strict();

export const weeklyMyRankV1Schema = z.object({
  rank: z.number().int().positive(),
  totalCompetitors: z.number().int().positive(),
  percentile: z.number().min(0).max(100),
  displayScore: z.number().int().nonnegative(),
}).strict().refine(
  (value) => value.rank <= value.totalCompetitors,
  'rank cannot exceed total competitors',
);

export const weeklyCategoryBoardResponseV1Schema = z.object({
  seasonId: z.uuid(),
  category: rankedCategoryV1Schema,
  snapshotRevision: z.string().trim().min(1),
  rows: z.array(publicWeeklyRankingRowV1Schema).max(10),
  myRank: weeklyMyRankV1Schema.nullable(),
}).strict();

export type RankedCategoryV1 = z.infer<typeof rankedCategoryV1Schema>;
export type WeeklyLeaderboardQueryV1 = z.infer<typeof weeklyLeaderboardQueryV1Schema>;
export type PublicWeeklyRankingRowV1 = z.infer<typeof publicWeeklyRankingRowV1Schema>;
export type WeeklyMyRankV1 = z.infer<typeof weeklyMyRankV1Schema>;
export type WeeklyCategoryBoardResponseV1 = z.infer<typeof weeklyCategoryBoardResponseV1Schema>;

export function parseWeeklyCategoryBoardResponseV1(input: unknown): WeeklyCategoryBoardResponseV1 {
  return weeklyCategoryBoardResponseV1Schema.parse(input);
}
