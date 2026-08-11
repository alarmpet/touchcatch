import { describe, expect, it, vi } from 'vitest';
import { createPgRpcClient, createSubjectResolutionRpc } from './pg-rpc.js';

describe('PostgreSQL restricted RPC client', () => {
  it('uses a transaction, SET LOCAL ROLE, and positional parameters', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ response: { ok: true } }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const rpc = createPgRpcClient({ connect: async () => ({ query, release }) });
    await expect(rpc.call('read_pet_inventory_v1', ['a', 'rev', 'hash'])).resolves.toEqual({ ok: true });
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'begin',
      'set local role economy_server',
      'select private.read_pet_inventory_v1($1::uuid,$2::text,$3::text) response',
      'commit',
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual(['a', 'rev', 'hash']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and never accepts an arbitrary function name', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('secret db detail')).mockResolvedValueOnce({ rows: [] });
    const rpc = createPgRpcClient({ connect: async () => ({ query, release: vi.fn() }) });
    await expect(rpc.call('read_weekly_category_board_v1', ['a', 'b', 'ENGLISH', 10])).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(query).toHaveBeenLastCalledWith('rollback');
    await expect(rpc.call('private.anything(); drop table profiles;--' as never, [])).rejects.toThrow('RPC_NOT_ALLOWED');
  });

  it('adapts the Task 3 named subject argument without exposing arbitrary RPCs', async () => {
    const call = vi.fn().mockResolvedValue('20000000-0000-4000-8000-000000000001');
    await expect(createSubjectResolutionRpc({ call }).call('private.ensure_mobile_account_v1', { authenticatedUserId: '10000000-0000-4000-8000-000000000001' })).resolves.toMatch(/^2000/u);
    expect(call).toHaveBeenCalledWith('ensure_mobile_account_v1', ['10000000-0000-4000-8000-000000000001']);
    await expect(createSubjectResolutionRpc({ call }).call('private.other', {})).rejects.toThrow('RPC_NOT_ALLOWED');
  });
});
