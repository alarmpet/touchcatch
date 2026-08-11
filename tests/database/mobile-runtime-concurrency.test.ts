import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

function databaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const output = explicit ?? execFileSync(
    process.execPath,
    [resolve('node_modules/supabase/dist/supabase.js'), 'status', '-o', 'env'],
    { encoding: 'utf8' },
  );
  const raw = explicit ?? /^DB_URL=(?:"([^"]+)"|([^\r\n]+))$/mu.exec(output)?.slice(1).find(Boolean);
  if (!raw) throw new Error('local DB required');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('loopback required');
  return url.toString();
}

const pool = new Pool({ connectionString: databaseUrl(), max: 25 });

async function economyRole(client: PoolClient): Promise<void> {
  await client.query('set role economy_server');
  expect((await client.query('select current_user')).rows[0]?.current_user).toBe('economy_server');
}

afterAll(async () => pool.end());

describe('mobile account bootstrap production-role concurrency', () => {
  it('collapses twenty concurrent calls into one opaque subject and one profile', async () => {
    const authenticatedUserId = randomUUID();
    await pool.query(
      "insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)",
      [authenticatedUserId, `${authenticatedUserId}@mobile-account.test`],
    );

    const clients = await Promise.all(Array.from({ length: 20 }, () => pool.connect()));
    try {
      await Promise.all(clients.map(economyRole));
      const results = await Promise.all(clients.map((client) => client.query(
        'select private.ensure_mobile_account_v1($1) response',
        [authenticatedUserId],
      )));
      const responses = results.map((result) => result.rows[0]?.response);
      expect(new Set(responses)).toHaveLength(1);

      const subjectKey = responses[0];
      expect(subjectKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
      expect(subjectKey).not.toBe(authenticatedUserId);

      expect(await pool.query(
        'select count(*)::int count from private.economy_subjects where user_id=$1',
        [authenticatedUserId],
      ).then((result) => result.rows[0]?.count)).toBe(1);
      expect(await pool.query(
        'select count(*)::int count from public.profiles where id=$1',
        [authenticatedUserId],
      ).then((result) => result.rows[0]?.count)).toBe(1);

      const profile = await pool.query(
        'select nickname from public.profiles where id=$1',
        [authenticatedUserId],
      ).then((result) => result.rows[0]);
      expect(profile?.nickname).toMatch(/^learner-[0-9a-f]{12}$/u);
      expect(profile?.nickname).not.toContain(authenticatedUserId);
      expect(profile?.nickname).not.toContain(subjectKey.slice(0, 8));
    } finally {
      await Promise.all(clients.map(async (client) => {
        await client.query('reset role').catch(() => undefined);
        client.release();
      }));
    }
  });

  it('restores the same positive-copy pet projection after reconnecting', async () => {
    const authenticatedUserId = randomUUID();
    const catalogRevision = `mobile-reconnect-${randomUUID()}`;
    const catalogHash = randomUUID().replaceAll('-', '').repeat(2);
    const petId = randomUUID();
    const userPetId = randomUUID();
    const acquiredAt = new Date('2026-08-02T03:04:05.000Z');

    await pool.query(
      "insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)",
      [authenticatedUserId, `${authenticatedUserId}@mobile-reconnect.test`],
    );

    const bootstrapClient = await pool.connect();
    let subjectKey: string;
    try {
      await economyRole(bootstrapClient);
      subjectKey = await bootstrapClient.query(
        'select private.ensure_mobile_account_v1($1) response',
        [authenticatedUserId],
      ).then((result) => result.rows[0]?.response as string);
    } finally {
      await bootstrapClient.query('reset role').catch(() => undefined);
      bootstrapClient.release();
    }

    await pool.query(
      'insert into private.pet_catalog_revisions(catalog_revision,catalog_hash) values($1,$2)',
      [catalogRevision, catalogHash],
    );
    await pool.query(
      `insert into private.pet_definitions(pet_id,rarity,display_key,coach_archetype)
       values($1,'RARE','mobile.pet.reconnect','SCOUT')`,
      [petId],
    );
    await pool.query(
      `insert into private.pet_catalog_revision_entries(catalog_revision,pet_id,rarity,ordinal)
       values($1,$2,'RARE',0)`,
      [catalogRevision, petId],
    );
    await pool.query(
      `insert into private.pet_inventory(
        user_pet_id,subject_key,pet_id,rarity,copies,selected,locked,
        acquired_catalog_revision,acquired_catalog_hash,acquired_at
      ) values($1,$2,$3,'RARE',3,true,true,$4,$5,$6)`,
      [userPetId, subjectKey, petId, catalogRevision, catalogHash, acquiredAt],
    );

    async function readWithNewSession(): Promise<Record<string, unknown>> {
      const client = await pool.connect();
      try {
        await economyRole(client);
        return await client.query(
          'select private.read_pet_inventory_v1($1,$2,$3) response',
          [subjectKey, catalogRevision, catalogHash],
        ).then((result) => result.rows[0]?.response as Record<string, unknown>);
      } finally {
        await client.query('reset role').catch(() => undefined);
        client.release();
      }
    }

    const first = await readWithNewSession();
    const afterReconnect = await readWithNewSession();
    expect(afterReconnect).toEqual(first);
    expect(afterReconnect).toMatchObject({
      catalogRevision,
      catalogHash,
      ownedCount: 1,
      totalCount: 1,
      pets: [{
        userPetId,
        petId,
        copies: 3,
        selected: true,
        locked: true,
        acquiredCatalogRevision: catalogRevision,
        acquiredCatalogHash: catalogHash,
        acquisitionDateStatus: 'KNOWN',
      }],
    });
  });

  it('upgrades an already-installed publisher to admit categorized content', async () => {
    const client = await pool.connect();
    const signature = 'private.publish_content_revision_v1(jsonb,jsonb,jsonb,text,text,text,text)';
    const oldKeys = "array['contentId','version','contentRevisionId','schemaVersion','assetPolicyVersion','theme','language','difficulty','imageA','imageB']";
    const newKeys = "array['contentId','version','contentRevisionId','schemaVersion','assetPolicyVersion','theme','category','language','difficulty','imageA','imageB']";
    const oldGuard = "or requested_public_content->>'language' not in ('ko','en','ja')";
    const newGuard = "or requested_public_content->>'category' not in ('ENGLISH','PROVERB','IDIOM','GENERAL_KNOWLEDGE')\n     or requested_public_content->>'language' not in ('ko','en','ja')";
    try {
      await client.query('begin');
      const current = await client.query<{ definition: string }>(
        'select pg_catalog.pg_get_functiondef($1::regprocedure) definition',
        [signature],
      ).then((result) => result.rows[0]?.definition ?? '');
      const legacy = current.replaceAll(newKeys, oldKeys).replace(newGuard, oldGuard);
      expect(legacy).not.toContain(newKeys);
      expect(legacy).not.toContain("requested_public_content->>'category'");
      await client.query('grant game_security_owner to postgres');
      await client.query('grant create on schema private to game_security_owner');
      await client.query('set local role game_security_owner');
      await client.query(legacy);

      await client.query(readFileSync(
        resolve('supabase/migrations/202608110002_mobile_runtime_upgrade_compatibility.sql'),
        'utf8',
      ));
      const upgraded = await client.query<{ definition: string }>(
        'select pg_catalog.pg_get_functiondef($1::regprocedure) definition',
        [signature],
      ).then((result) => result.rows[0]?.definition ?? '');
      expect(upgraded).toContain(newKeys);
      expect(upgraded).toContain("requested_public_content->>'category' not in ('ENGLISH','PROVERB','IDIOM','GENERAL_KNOWLEDGE')");
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
