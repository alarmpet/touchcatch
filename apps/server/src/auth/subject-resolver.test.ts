import { describe, expect, it } from 'vitest';
import { createSubjectResolver } from './subject-resolver.js';

const authenticatedUserId = '10000000-0000-4000-8000-000000000001';
const subjectKey = '20000000-0000-4000-8000-000000000001';

describe('opaque economy subject resolution', () => {
  it('calls only the restricted account bootstrap RPC and returns its opaque subject', async () => {
    const calls: Array<Readonly<{ functionName: string; args: Record<string, unknown> }>> = [];
    const resolver = createSubjectResolver({
      async call(functionName, args) {
        calls.push({ functionName, args });
        return subjectKey;
      },
    });

    await expect(resolver.ensureAndResolve(authenticatedUserId)).resolves.toBe(subjectKey);
    expect(calls).toEqual([{
      functionName: 'private.ensure_mobile_account_v1',
      args: { authenticatedUserId },
    }]);
  });

  it('rejects malformed auth and subject identifiers without exposing either value', async () => {
    const resolver = createSubjectResolver({
      async call() {
        return 'not-an-opaque-uuid';
      },
    });
    await expect(resolver.ensureAndResolve('not-an-auth-uuid')).rejects.toThrow('SUBJECT_RESOLUTION_FAILED');
    await expect(resolver.ensureAndResolve(authenticatedUserId)).rejects.toThrow('SUBJECT_RESOLUTION_FAILED');
  });
});
