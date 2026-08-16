import { describe, expect, it, vi } from 'vitest';
import { createSqlRpcClient, SqlRpcError } from './sql-rpc-client.js';

describe('SqlRpcClient', () => {
  it('passes the exact RPC function and arguments', async () => {
    const transport = vi.fn().mockResolvedValue({ committed: true });
    const client = createSqlRpcClient(transport);
    await expect(client.call('private.commit_learning_attempt_v1', { attemptId: 'a1' })).resolves.toEqual({ committed: true });
    expect(transport).toHaveBeenCalledWith('private.commit_learning_attempt_v1', { attemptId: 'a1' });
  });

  it('preserves stable database error codes', async () => {
    const client = createSqlRpcClient(async () => { throw { code: 'IDEMPOTENCY_CONFLICT', message: 'duplicate' }; });
    await expect(client.call('private.commit_learning_attempt_v1', {})).rejects.toMatchObject({ name: 'SqlRpcError', code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('does not rewrite an existing typed RPC error', async () => {
    const error = new SqlRpcError('POLICY_MISMATCH', 'policy');
    const client = createSqlRpcClient(async () => { throw error; });
    await expect(client.call('private.start_learning_attempt_v1', {})).rejects.toBe(error);
  });
});
