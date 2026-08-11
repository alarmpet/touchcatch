const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SubjectResolver {
  ensureAndResolve(authenticatedUserId: string): Promise<string>;
}

export interface SubjectResolutionRpc {
  call(functionName: string, args: Record<string, unknown>): Promise<unknown>;
}

export class SubjectResolutionError extends Error {
  readonly code = 'SUBJECT_RESOLUTION_FAILED' as const;

  constructor(options?: ErrorOptions) {
    super('SUBJECT_RESOLUTION_FAILED', options);
    this.name = 'SubjectResolutionError';
  }
}

export function createSubjectResolver(rpc: SubjectResolutionRpc): SubjectResolver {
  return {
    async ensureAndResolve(authenticatedUserId: string): Promise<string> {
      if (!uuidPattern.test(authenticatedUserId)) throw new SubjectResolutionError();
      try {
        const subjectKey = await rpc.call(
          'private.ensure_mobile_account_v1',
          { authenticatedUserId },
        );
        if (typeof subjectKey !== 'string' || !uuidPattern.test(subjectKey)) {
          throw new SubjectResolutionError();
        }
        return subjectKey;
      } catch (error) {
        if (error instanceof SubjectResolutionError) throw error;
        throw new SubjectResolutionError({ cause: error });
      }
    },
  };
}
