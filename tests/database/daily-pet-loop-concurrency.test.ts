import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTestEconomyFixture } from '../helpers/load-test-economy-fixture.js';

function databaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const output = explicit ?? execFileSync(
    process.execPath,
    [resolve('D:/touchcatch/node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'],
    { encoding: 'utf8' },
  );
  const raw = explicit ?? /^DB_URL=(?:"([^"]+)"|([^\r\n]+))$/mu.exec(output)?.slice(1).find(Boolean);
  if (!raw) throw new Error('local DB required');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('loopback required');
  return url.toString();
}

const pool = new Pool({ connectionString: databaseUrl(), max: 25 });
let fixture: Awaited<ReturnType<typeof loadTestEconomyFixture>>;

async function economyRole(client: PoolClient): Promise<void> {
  await client.query('set role economy_server');
  expect((await client.query('select current_user')).rows[0]?.current_user).toBe('economy_server');
}

beforeAll(async () => {
  fixture = await loadTestEconomyFixture();
  const exists = await pool.query(
    'select 1 from private.economy_policy_revisions where economy_hash=$1',
    [fixture.economyHash],
  );
  if (exists.rowCount === 0) {
    const client = await pool.connect();
    try {
      await client.query('set role economy_deployment_role');
      await client.query('select private.publish_economy_bundle_v1($1,$2)', [
        fixture.publishInput.economy,
        fixture.publishInput.catalog,
      ]);
    } finally {
      await client.query('reset role').catch(() => undefined);
      client.release();
    }
  }
});

afterAll(async () => pool.end());

describe('daily pet loop production-role concurrency', () => {
  it('collapses 20 same-day claims before entropy and preserves direct-draw pity', async () => {
    const subject = randomUUID();
    await pool.query('insert into private.economy_subjects(subject_key) values($1)', [subject]);
    await pool.query(
      `insert into private.gacha_pity_state(
        subject_key,pity_series_id,pity_semantics_hash,rare_counter,legendary_counter,
        economy_version,economy_hash,catalog_revision,catalog_hash
      ) values($1,$2,$3,49,149,$4,$5,$6,$7)`,
      [
        subject,
        fixture.pitySeriesId,
        fixture.pitySemanticsHash,
        fixture.economyVersion,
        fixture.economyHash,
        fixture.catalogRevision,
        fixture.catalogHash,
      ],
    );
    const clients = await Promise.all(Array.from({ length: 20 }, () => pool.connect()));
    try {
      await Promise.all(clients.map(economyRole));
      const results = await Promise.all(clients.map((client) => client.query(
        'select private.claim_daily_free_draw_v1($1,$2,$3,$4) response',
        [subject, fixture.economyHash, fixture.catalogRevision, fixture.catalogHash],
      )));
      const responses = results.map((result) => result.rows[0]?.response);
      expect(new Set(responses.map((response) => JSON.stringify(response)))).toHaveLength(1);
      expect(await pool.query(
        'select count(*)::int count from private.daily_pet_claims where subject_key=$1',
        [subject],
      ).then((result) => result.rows[0]?.count)).toBe(1);
      expect(await pool.query(
        'select count(*)::int count from private.daily_pet_draw_history where subject_key=$1',
        [subject],
      ).then((result) => result.rows[0]?.count)).toBe(1);
      expect(await pool.query(
        'select rare_counter,legendary_counter from private.gacha_pity_state where subject_key=$1',
        [subject],
      ).then((result) => result.rows[0])).toEqual({ rare_counter: 49, legendary_counter: 149 });
    } finally {
      await Promise.all(clients.map(async (client) => {
        await client.query('reset role').catch(() => undefined);
        client.release();
      }));
    }
  });
});
