import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve('supabase/migrations/202607300000_daily_pet_loop.sql'), 'utf8');
const pgTap = readFileSync(resolve('supabase/tests/database/daily-pet-loop.test.sql'), 'utf8');
const concurrency = readFileSync(resolve('tests/database/daily-pet-loop-concurrency.test.ts'), 'utf8');
const mobileMigration = readFileSync(resolve('supabase/migrations/202608110001_mobile_runtime_projections.sql'), 'utf8');
const mobileUpgradeMigration = readFileSync(resolve('supabase/migrations/202608110002_mobile_runtime_upgrade_compatibility.sql'), 'utf8');
const mobilePgTap = readFileSync(resolve('supabase/tests/database/mobile-runtime-projections.test.sql'), 'utf8');
const mobileConcurrency = readFileSync(resolve('tests/database/mobile-runtime-concurrency.test.ts'), 'utf8');

describe('daily pet loop SQL static regression contract', () => {
  it('requires both commands to receive an adapter-resolved, still-linked subject without querying auth schema', () => {
    expect(migration).toMatch(/claim_daily_free_draw_v1\([\s\S]{0,100}p_subject_key uuid/i);
    expect(migration).not.toMatch(/auth\.users/i);
    expect(migration).toMatch(/claim_daily_free_draw_v1\([\s\S]+where s\.subject_key\s*=\s*p_subject_key and s\.user_id is not null[\s\S]+create function private\.promote_duplicate_cards_v1/i);
    expect(migration).toMatch(/promote_duplicate_cards_v1\([\s\S]+where s\.subject_key\s*=\s*p_subject_key and s\.user_id is not null/i);
    expect(migration).not.toMatch(/p_authenticated_user_id uuid/i);
    expect(pgTap).toMatch(/deleted or unlinked account cannot claim/i);
    expect(pgTap).toMatch(/unlinked account cannot promote/i);
  });

  it('locks and consumes all eligible same-pet rows in stable order', () => {
    expect(migration).toMatch(/where i\.subject_key = p_subject_key and i\.pet_id = v_source_pet_id[\s\S]+order by i\.user_pet_id[\s\S]+for update/i);
    expect(migration).toMatch(/not i\.selected and not i\.locked/i);
    expect(migration).toMatch(/v_remaining_to_consume\s+integer\s*:=\s*10/i);
    expect(pgTap).toMatch(/eleven one-copy rows aggregate/i);
  });

  it('excludes zero-copy tombstones from every owned inventory candidate query', () => {
    expect(migration).toMatch(/where i\.subject_key = p_subject_key and i\.pet_id = v_pet_id\s+and i\.copies > 0/i);
    expect(migration).toMatch(/where i\.subject_key = p_subject_key and i\.pet_id = v_source_pet_id\s+and i\.copies > 0\s+order by i\.user_pet_id\s+for update/i);
    expect(migration).toMatch(/where i\.subject_key = p_subject_key and i\.pet_id = v_target_pet_id\s+and i\.copies > 0/i);
    expect(pgTap).toMatch(/zero-copy tombstone is excluded from owned inventory/i);
  });

  it('backfills acquisition time only from real history and leaves unknown legacy dates nullable', () => {
    expect(migration).toMatch(/add column if not exists acquired_at timestamptz(?! not null)(?! default)/i);
    expect(migration).toMatch(/update private\.pet_inventory[\s\S]+from[\s\S]+private\.gacha_history/i);
    expect(migration).toMatch(/alter column acquired_at set default clock_timestamp\(\)/i);
    expect(migration).not.toMatch(/add column if not exists acquired_at timestamptz not null default clock_timestamp\(\)/i);
  });

  it('requires JSON numeric integer ten and a canonical UUIDv4 pet ID', () => {
    expect(migration).toMatch(/jsonb_typeof\(p_materials#>'\{0,count\}'\)\s*<>\s*'number'/i);
    expect(migration).toMatch(/\(p_materials#>>'\{0,count\}'\)::numeric\s*<>\s*10/i);
    expect(migration).toMatch(/get_byte\(uuid_send\(v_source_pet_id\), 6\)[\s\S]+get_byte\(uuid_send\(v_source_pet_id\), 8\)/i);
  });

  it('keeps the DB harness portable and pins the exact economy-server allowlist', () => {
    expect(concurrency).not.toContain('D:/touchcatch');
    expect(concurrency).toMatch(/resolve\('node_modules\/supabase\/dist\/supabase\.js'\)/);
    expect(pgTap).toMatch(/economy_server exact function allowlist includes daily loop commands/i);
    expect(pgTap).toMatch(/IDEMPOTENCY_CONFLICT[\s\S]+same key with a different hash/i);
  });
});

describe('mobile runtime SQL static regression contract', () => {
  it('keeps account, pet, and weekly reads behind hardened server-only functions', () => {
    expect(mobileMigration).toMatch(/create function private\.ensure_mobile_account_v1[\s\S]+security definer[\s\S]+set search_path = pg_catalog/i);
    expect(mobileMigration).toMatch(/create function private\.read_pet_inventory_v1[\s\S]+security definer[\s\S]+set search_path = pg_catalog/i);
    expect(mobileMigration).toMatch(/create function private\.read_weekly_category_board_v1[\s\S]+security definer[\s\S]+set search_path = pg_catalog/i);
    expect(mobileMigration).toMatch(/revoke execute on function private\.read_weekly_category_board_v1[\s\S]+authenticated[\s\S]+grant execute[\s\S]+to economy_server/i);
    expect(mobilePgTap).toMatch(/hardened non-login-owner security definers/i);
    expect(pgTap).toMatch(/'ensure_mobile_account_v1'[\s\S]+'read_pet_inventory_v1'[\s\S]+'read_weekly_category_board_v1'/i);
  });

  it('projects only authoritative positive-copy pet inventory and survives reconnects', () => {
    expect(mobileMigration).toMatch(/from private\.pet_inventory inventory[\s\S]+inventory\.copies > 0/i);
    expect(mobileMigration).not.toMatch(/public\.user_pets/i);
    expect(mobileMigration).toMatch(/'level', 1[\s\S]+'xp', 0/i);
    expect(mobileConcurrency).toMatch(/Array\.from\(\{ length: 20 \}/i);
    expect(mobileConcurrency).toMatch(/restores the same positive-copy pet projection after reconnecting/i);
  });

  it('ranks only verified best pointers across the five pinned challenges without leaking identities', () => {
    expect(mobileMigration).toMatch(/from private\.learning_best_records best[\s\S]+verification_status = 'COMPLETED_VERIFIED'/i);
    expect(mobileMigration).toMatch(/from private\.weekly_challenge_pins pins[\s\S]+\) = 5/i);
    expect(mobileMigration).toMatch(/p_limit < 1 or p_limit > 10/i);
    expect(mobilePgTap).toMatch(/ignores unpointed and quarantined replay scores/i);
    expect(mobilePgTap).toMatch(/exposes no subject, auth-user, or email identifiers/i);
    expect(mobilePgTap).toMatch(/perform zero attempt or best-record writes/i);
  });

  it('repairs category publication on forward-upgraded databases', () => {
    expect(mobileUpgradeMigration).toMatch(/pg_get_functiondef/i);
    expect(mobileUpgradeMigration).toMatch(/PUBLIC_CONTENT_CATEGORY_UPGRADE_UNEXPECTED/i);
    expect(mobileUpgradeMigration).toMatch(/'ENGLISH','PROVERB','IDIOM','GENERAL_KNOWLEDGE'/i);
  });
});
