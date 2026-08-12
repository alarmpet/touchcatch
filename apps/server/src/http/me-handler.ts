import type { BearerVerifier } from '../auth/bearer.js';
import type { SubjectResolver } from '../auth/subject-resolver.js';
import { jsonResponse } from './errors.js';

export function createMeHandler(input: Readonly<{
  verifier: BearerVerifier;
  subjectResolver: SubjectResolver;
}>): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if ([...new URL(request.url).searchParams].length !== 0) return jsonResponse(400, { code: 'INVALID_REQUEST' });
      const principal = await input.verifier.verify(request);
      await input.subjectResolver.ensureAndResolve(principal.authenticatedUserId);
      return jsonResponse(200, { accountReady: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return jsonResponse(401, { code: 'UNAUTHORIZED' });
      return jsonResponse(503, { code: 'ACCOUNT_SETUP_FAILED' });
    }
  };
}
