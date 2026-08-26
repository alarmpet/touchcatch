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

/**
 * The subject exists but a deletion request has closed it.
 *
 * This has to stay distinct from `SubjectResolutionError`, which deliberately flattens every
 * failure into one opaque code. A closed account is not an outage: the caller needs to be told
 * the account is gone rather than invited to retry against a database that is working fine.
 */
export class AccountClosedError extends Error {
  readonly code = 'ACCOUNT_CLOSED' as const;

  constructor() {
    super('ACCOUNT_CLOSED');
    this.name = 'AccountClosedError';
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
        if (error instanceof AccountClosedError) throw error;
        // The database raises ACCOUNT_CLOSED from the account gate. Losing it here would turn a
        // deleted account into a 503 and invite the client to retry forever.
        const code = error instanceof Error
          ? ((error as Error & { code?: string }).code ?? error.message)
          : '';
        if (code === 'ACCOUNT_CLOSED') throw new AccountClosedError();
        throw new SubjectResolutionError({ cause: error });
      }
    },
  };
}
