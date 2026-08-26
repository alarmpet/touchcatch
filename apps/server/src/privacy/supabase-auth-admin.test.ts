import { describe, expect, it } from 'vitest';
import { createSupabaseAuthAdmin, type FetchLike } from './supabase-auth-admin.js';

function adminWith(responder: FetchLike) {
  return createSupabaseAuthAdmin({
    supabaseUrl: 'https://project.supabase.co/',
    serviceRoleKey: 'sb_secret_example',
    fetchImpl: responder,
    timeoutMs: 50,
  });
}

const status = (code: number): FetchLike => async () => ({ status: code, text: async () => '' });
const userId = '33333333-3333-4333-8333-333333333333';

describe('supabase auth admin', () => {
  it('calls the admin delete endpoint with the service-role credential', async () => {
    const seen: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const admin = adminWith(async (url, init) => {
      seen.push({ url, method: init.method, headers: init.headers });
      return { status: 204, text: async () => '' };
    });
    await admin.deleteUser(userId);
    expect(seen[0]!.method).toBe('DELETE');
    // The trailing slash on the configured origin must not produce a double slash.
    expect(seen[0]!.url).toBe(`https://project.supabase.co/auth/v1/admin/users/${userId}`);
    expect(seen[0]!.headers.Authorization).toBe('Bearer sb_secret_example');
  });

  it.each([200, 204])('treats %i as completed', async (code) => {
    expect(await adminWith(status(code)).deleteUser(userId)).toEqual({ kind: 'COMPLETED' });
  });

  it('treats a missing user as already done', async () => {
    // The goal was that the user not exist. It does not exist.
    expect(await adminWith(status(404)).deleteUser(userId)).toMatchObject({
      kind: 'NOT_APPLICABLE',
    });
  });

  it.each([401, 403])('treats %i as permanent, not worth retrying', async (code) => {
    expect(await adminWith(status(code)).deleteUser(userId)).toMatchObject({
      kind: 'FAILED_PERMANENT',
      detail: `AUTH_ADMIN_${code}`,
    });
  });

  it.each([429, 500, 503])('cannot vouch for the outcome of %i', async (code) => {
    // The server may well have deleted the user before failing to say so.
    expect(await adminWith(status(code)).deleteUser(userId)).toMatchObject({
      kind: 'UNKNOWN_OUTCOME',
    });
  });

  it('cannot vouch for the outcome of a transport failure either', async () => {
    const admin = adminWith(async () => {
      throw new Error('socket hang up');
    });
    expect(await admin.deleteUser(userId)).toMatchObject({ kind: 'UNKNOWN_OUTCOME' });
  });

  it('cannot vouch for the outcome of a timeout', async () => {
    const admin = adminWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    expect(await admin.deleteUser(userId)).toEqual({
      kind: 'UNKNOWN_OUTCOME',
      detail: 'AbortError',
    });
  });

  it('rejects a malformed user id without making a request', async () => {
    let called = false;
    const admin = adminWith(async () => {
      called = true;
      return { status: 204, text: async () => '' };
    });
    expect(await admin.deleteUser('../../etc/passwd')).toMatchObject({
      kind: 'FAILED_PERMANENT',
      detail: 'INVALID_USER_ID',
    });
    expect(called).toBe(false);
  });
});
