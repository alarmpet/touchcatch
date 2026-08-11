import { weeklyLeaderboardQueryV1Schema } from '../../../../packages/contracts/src/learning-leaderboard.js';
import type { BearerVerifier } from '../auth/bearer.js';
import type { SubjectResolver } from '../auth/subject-resolver.js';
import type { WeeklyCategoryBoardRepository } from '../learning/weekly-category-board.js';
import type { MobileRuntimePolicy } from '../policy/mobile-runtime-policy.js';
import { jsonResponse } from './errors.js';

export function createRankingHandler(input: Readonly<{
  verifier: BearerVerifier;
  subjectResolver: SubjectResolver;
  getPolicy(): MobileRuntimePolicy;
  board: WeeklyCategoryBoardRepository;
}>): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const principal = await input.verifier.verify(request);
      const url = new URL(request.url);
      const limitText = url.searchParams.get('limit');
      const parsed = weeklyLeaderboardQueryV1Schema.safeParse({
        seasonId: url.searchParams.get('seasonId'),
        category: url.searchParams.get('category'),
        limit: limitText !== null && /^\d+$/u.test(limitText) ? Number(limitText) : Number.NaN,
      });
      if (!parsed.success) return jsonResponse(400, { code: 'INVALID_QUERY' });
      const policy = input.getPolicy().ranking;
      if (!policy.enabled) return jsonResponse(409, { code: policy.code });
      const subjectKey = await input.subjectResolver.ensureAndResolve(principal.authenticatedUserId);
      return jsonResponse(200, await input.board.read({ subjectKey, ...parsed.data }));
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonResponse(401, { code: 'UNAUTHORIZED' });
      return jsonResponse(503, { code: 'LEADERBOARD_UNAVAILABLE' });
    }
  };
}
