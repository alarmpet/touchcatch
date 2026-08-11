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
    const callParsed = vi.fn().mockImplementation(async (_name, _args, parse) => parse('20000000-0000-4000-8000-000000000001'));
    const rpc = { call: vi.fn(), callParsed };
    await expect(createSubjectResolutionRpc(rpc).call('private.ensure_mobile_account_v1', { authenticatedUserId: '10000000-0000-4000-8000-000000000001' })).resolves.toMatch(/^2000/u);
    expect(callParsed.mock.calls[0]?.slice(0, 2)).toEqual(['ensure_mobile_account_v1', ['10000000-0000-4000-8000-000000000001']]);
    await expect(createSubjectResolutionRpc(rpc).call('private.other', {})).rejects.toThrow('RPC_NOT_ALLOWED');
  });

  it('parses before commit and destroys a connection when rollback fails', async () => {
    const parseQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ response: { private: true } }] })
      .mockResolvedValueOnce({ rows: [] });
    const releaseAfterParse = vi.fn();
    const parsedRpc = createPgRpcClient({ connect: async () => ({ query: parseQuery, release: releaseAfterParse }) });
    await expect(parsedRpc.callParsed('claim_daily_free_draw_v1', [], () => { throw new Error('DTO_INVALID'); })).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(parseQuery.mock.calls.map(([sql]) => sql)).toEqual(['begin', 'set local role economy_server', 'select private.claim_daily_free_draw_v1($1::uuid,$2::text,$3::text,$4::text) response', 'rollback']);

    const rollbackError = new Error('rollback socket failure');
    const failedQuery = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error('db failure')).mockRejectedValueOnce(rollbackError);
    const destroy = vi.fn();
    const failedRpc = createPgRpcClient({ connect: async () => ({ query: failedQuery, release: destroy }) });
    await expect(failedRpc.call('read_pet_inventory_v1', [])).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' });
    expect(destroy).toHaveBeenCalledWith(rollbackError);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
