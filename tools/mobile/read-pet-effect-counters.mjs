import pg from 'pg';

const databaseUrl = process.env.MOBILE_API_SMOKE_DATABASE_URL?.trim();
if (!databaseUrl) {
  process.stderr.write('MOBILE_API_SMOKE_DATABASE_URL is required for the read-only effect counter probe.\n');
  process.exitCode = 1;
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, application_name: 'touchcatch_smoke_counter' });
  try {
    const result = await pool.query(`
      select
        (select count(*)::integer from private.economy_subjects) as "economySubjects",
        (select count(*)::integer from public.profiles) as "profiles",
        (select count(*)::integer from private.daily_pet_claims) as "dailyClaims",
        (select count(*)::integer from private.daily_pet_draw_history) as "dailyHistory",
        (select count(*)::integer from private.duplicate_promotion_receipts) as "promotionReceipts",
        (select count(*)::integer from private.duplicate_promotion_history) as "promotionHistory",
        (select count(*)::integer from private.pet_loop_outbox_events) as "outboxEvents"
    `);
    process.stdout.write(JSON.stringify(result.rows[0]));
  } catch {
    process.stderr.write('pet effect counter probe failed\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
