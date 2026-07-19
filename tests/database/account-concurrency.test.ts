import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

function adminUrl(): URL {
  const output = execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'], { encoding: 'utf8', windowsHide: true });
  const raw = /^DB_URL=(?:"([^"]+)"|([^\r\n]+))$/mu.exec(output)?.slice(1).find(Boolean);
  if (!raw) throw new Error('local DB_URL required');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('loopback database required');
  return url;
}

const rootUrl = adminUrl();
const admin = new Pool({ connectionString: rootUrl.toString(), max: 22 });
const userId = randomUUID();
let api: Pool;

beforeAll(async () => {
  await admin.query("insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)", [userId, `${userId}@example.test`]);
  const url = new URL(rootUrl);
  url.username = 'touchcatch_api_test';
  url.password = 'touchcatch_local_test_only';
  api = new Pool({ connectionString: url.toString(), max: 20 });
});

afterAll(async () => {
  await api?.end();
  await admin.query('delete from auth.users where id=$1', [userId]).catch(() => undefined);
  await admin.end();
});

describe('restricted account bootstrap sessions', () => {
  it('collapses twenty concurrent bootstraps to one complete account', async () => {
    const clients = await Promise.all(Array.from({ length: 20 }, () => api.connect()));
    try {
      const results = await Promise.all(clients.map(async (client) => {
        await client.query('begin');
        await client.query('set local role app_server');
        const value = (await client.query<{ value: unknown }>('select private.ensure_account_v1($1) as value', [userId])).rows[0]?.value;
        await client.query('commit');
        return value;
      }));
      expect(new Set(results.map((value) => JSON.stringify(value))).size).toBe(1);
      expect((await admin.query('select count(*)::int n from public.profiles where id=$1', [userId])).rows[0]?.n).toBe(1);
      expect((await admin.query('select count(*)::int n from private.api_subjects where user_id=$1', [userId])).rows[0]?.n).toBe(1);
      expect((await admin.query('select count(*)::int n from private.economy_subjects where user_id=$1', [userId])).rows[0]?.n).toBe(1);
    } finally { clients.forEach((client) => client.release()); }
  });

  it('resets role at transaction end and denies non-allowlisted access', async () => {
    const client = await api.connect();
    try {
      await expect(client.query('select private.read_me_v1($1)', [userId])).rejects.toThrow();
      await client.query('begin');
      await client.query('set local role app_server');
      await expect(client.query('select private.read_me_v1($1)', [userId])).resolves.toBeDefined();
      await expect(client.query('select private.draw_pet_v1(null,null,null,null,null,null,null)')).rejects.toThrow();
      await client.query('rollback');
      expect((await client.query<{ current_user: string }>('select current_user')).rows[0]?.current_user).toBe('touchcatch_api_test');
    } finally { client.release(); }
  });
});
