begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('private', 'daily_pet_claims', 'daily claims are private');
select has_table('private', 'duplicate_promotion_history', 'promotion history is private');
select has_function(
  'private',
  'claim_daily_free_draw_v1',
  array['uuid','text','text','text'],
  'daily claim entry point exists'
);
select has_function(
  'private',
  'promote_duplicate_cards_v1',
  array['uuid','uuid','text','jsonb','text','text','text'],
  'duplicate promotion entry point exists'
);
select ok(
  has_function_privilege(
    'economy_server',
    'private.claim_daily_free_draw_v1(uuid,text,text,text)',
    'EXECUTE'
  ),
  'only the economy server may claim the daily draw'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.claim_daily_free_draw_v1(uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot claim directly'
);

insert into private.pet_catalog_revisions(catalog_revision, catalog_hash)
values ('daily-loop-test', repeat('c', 64));
insert into private.pet_definitions(pet_id, rarity, display_key) values
  ('00000000-0000-4000-8000-000000000101', 'COMMON', 'daily.common.source'),
  ('00000000-0000-4000-8000-000000000102', 'RARE', 'daily.rare.source'),
  ('00000000-0000-4000-8000-000000000103', 'LEGENDARY', 'daily.legendary.source'),
  ('00000000-0000-4000-8000-000000000104', 'COMMON', 'daily.common.target'),
  ('00000000-0000-4000-8000-000000000105', 'RARE', 'daily.rare.target'),
  ('00000000-0000-4000-8000-000000000106', 'LEGENDARY', 'daily.legendary.target');
insert into private.pet_catalog_revision_entries(catalog_revision, pet_id, rarity, ordinal) values
  ('daily-loop-test', '00000000-0000-4000-8000-000000000101', 'COMMON', 0),
  ('daily-loop-test', '00000000-0000-4000-8000-000000000104', 'COMMON', 1),
  ('daily-loop-test', '00000000-0000-4000-8000-000000000102', 'RARE', 0),
  ('daily-loop-test', '00000000-0000-4000-8000-000000000105', 'RARE', 1),
  ('daily-loop-test', '00000000-0000-4000-8000-000000000103', 'LEGENDARY', 0),
  ('daily-loop-test', '00000000-0000-4000-8000-000000000106', 'LEGENDARY', 1);
insert into private.economy_policy_revisions(
  economy_version, economy_hash, pity_series_id, pity_semantics_hash,
  pity_semantics, draw_cost, reward_policies
) values (
  'daily-loop-test', repeat('e', 64), 'pity-50-150-v1', repeat('f', 64),
  '{"thresholds":{"rareOrBetter":50,"legendary":150}}', 100, '{}'
);

insert into private.economy_subjects(subject_key) values
  ('70000000-0000-4000-8000-000000000101'),
  ('70000000-0000-4000-8000-000000000102'),
  ('70000000-0000-4000-8000-000000000103'),
  ('70000000-0000-4000-8000-000000000104');
insert into private.gacha_pity_state(
  subject_key, pity_series_id, pity_semantics_hash, rare_counter, legendary_counter,
  economy_version, economy_hash, catalog_revision, catalog_hash
) values (
  '70000000-0000-4000-8000-000000000101', 'pity-50-150-v1', repeat('f', 64), 49, 149,
  'daily-loop-test', repeat('e', 64), 'daily-loop-test', repeat('c', 64)
);

create temp table first_daily_response(response jsonb) on commit drop;
insert into first_daily_response
select private.claim_daily_free_draw_v1(
  '70000000-0000-4000-8000-000000000101',
  repeat('e', 64), 'daily-loop-test', repeat('c', 64)
);
select is(
  private.claim_daily_free_draw_v1(
    '70000000-0000-4000-8000-000000000101',
    repeat('e', 64), 'daily-loop-test', repeat('c', 64)
  ),
  (select response from first_daily_response),
  'retry replays the stored daily response'
);
select is(
  (select count(*)::int from private.daily_pet_claims where subject_key = '70000000-0000-4000-8000-000000000101'),
  1,
  'one subject has one KST-date daily claim'
);
select is(
  (select count(*)::int from private.daily_pet_draw_history where subject_key = '70000000-0000-4000-8000-000000000101'),
  1,
  'daily history commits once'
);
select is(
  (select count(*)::int from private.pet_loop_outbox_events where subject_key = '70000000-0000-4000-8000-000000000101'),
  1,
  'daily outbox commits once'
);
select results_eq(
  $$select rare_counter, legendary_counter from private.gacha_pity_state where subject_key = '70000000-0000-4000-8000-000000000101'$$,
  $$values (49,149)$$,
  'daily claim neither reads nor mutates DIRECT_DRAW pity'
);

insert into private.pet_inventory(
  user_pet_id, subject_key, pet_id, rarity, copies,
  acquired_catalog_revision, acquired_catalog_hash
) values
  ('40000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000101', 'COMMON', 11, 'daily-loop-test', repeat('c', 64)),
  ('40000000-0000-4000-8000-000000000102', '70000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000102', 'RARE', 11, 'daily-loop-test', repeat('c', 64)),
  ('40000000-0000-4000-8000-000000000103', '70000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000101', 'COMMON', 10, 'daily-loop-test', repeat('c', 64)),
  ('40000000-0000-4000-8000-000000000104', '70000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000103', 'LEGENDARY', 11, 'daily-loop-test', repeat('c', 64));

create temp table common_promotion(response jsonb) on commit drop;
insert into common_promotion
select private.promote_duplicate_cards_v1(
  '70000000-0000-4000-8000-000000000102',
  '50000000-0000-4000-8000-000000000101', repeat('1', 64),
  '[{"userPetId":"40000000-0000-4000-8000-000000000101","count":10}]',
  repeat('e', 64), 'daily-loop-test', repeat('c', 64)
);
select is((select response#>>'{output,rarity}' from common_promotion), 'RARE', 'ten common spares issue one rare target');
select is((select copies from private.pet_inventory where user_pet_id = '40000000-0000-4000-8000-000000000101'), 1, 'promotion retains the base copy');
select is(
  private.promote_duplicate_cards_v1(
    '70000000-0000-4000-8000-000000000102',
    '50000000-0000-4000-8000-000000000101', repeat('1', 64),
    '[{"userPetId":"40000000-0000-4000-8000-000000000101","count":10}]',
    repeat('e', 64), 'daily-loop-test', repeat('c', 64)
  ),
  (select response from common_promotion),
  'promotion retry replays its effect-once receipt'
);
select is((select count(*)::int from private.duplicate_promotion_entitlements where status = 'CONSUMED'), 1, 'target entitlement is issued and consumed once');
select is((select count(*)::int from private.duplicate_promotion_history where subject_key = '70000000-0000-4000-8000-000000000102'), 1, 'promotion history commits once');

select is(
  private.promote_duplicate_cards_v1(
    '70000000-0000-4000-8000-000000000103',
    '50000000-0000-4000-8000-000000000102', repeat('2', 64),
    '[{"userPetId":"40000000-0000-4000-8000-000000000102","count":10}]',
    repeat('e', 64), 'daily-loop-test', repeat('c', 64)
  )#>>'{output,rarity}',
  'LEGENDARY',
  'ten rare spares issue one legendary target'
);
select throws_ok(
  $$select private.promote_duplicate_cards_v1(
    '70000000-0000-4000-8000-000000000104',
    '50000000-0000-4000-8000-000000000103', repeat('3', 64),
    '[{"userPetId":"40000000-0000-4000-8000-000000000103","count":10}]',
    repeat('e', 64), 'daily-loop-test', repeat('c', 64)
  )$$,
  'P0001', 'INSUFFICIENT_DUPLICATES', 'nine spare copies fail'
);
select throws_ok(
  $$select private.promote_duplicate_cards_v1(
    '70000000-0000-4000-8000-000000000104',
    '50000000-0000-4000-8000-000000000104', repeat('4', 64),
    '[{"userPetId":"40000000-0000-4000-8000-000000000103","count":5},{"userPetId":"40000000-0000-4000-8000-000000000104","count":5}]',
    repeat('e', 64), 'daily-loop-test', repeat('c', 64)
  )$$,
  'P0001', 'INVALID_MATERIALS', 'mixed-pet materials fail'
);
select throws_ok(
  $$select private.promote_duplicate_cards_v1(
    '70000000-0000-4000-8000-000000000104',
    '50000000-0000-4000-8000-000000000105', repeat('5', 64),
    '[{"userPetId":"40000000-0000-4000-8000-000000000104","count":10}]',
    repeat('e', 64), 'daily-loop-test', repeat('c', 64)
  )$$,
  'P0001', 'COSMETIC_REWARD_POLICY_REQUIRED', 'legendary spares fail closed without approved cosmetic policy'
);

select * from finish();
rollback;
