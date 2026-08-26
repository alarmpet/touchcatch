begin;set local statement_timeout='5s';create extension if not exists pgtap with schema extensions;select plan(7);
select has_function('private','apply_match_command_g3','G3 transaction adapter exists');

-- 202608260001 gave the g3 tables a foreign key to the match they belong to, so the lease can no
-- longer be taken on a match id that names nothing. The rows this test writes were always meant
-- to belong to a match; until the constraint existed, nothing said so.
\ir support/content-fixture.inc
set local role deployment_role;
do $$
declare bundle publish_bundle%rowtype;
begin
  select * into bundle from publish_bundle;
  perform private.publish_content_revision_v1(bundle.public_json,bundle.private_json,bundle.rights_json,bundle.public_text,bundle.private_text,bundle.rights_text,'1.0.0');
end $$;
reset role;
insert into public.matches(id, content_revision_id, status, server_version, ruleset_version, ruleset_hash, engine_version, protocol_version, experiment_variant)
values ('90000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff','WAITING_FOR_ASSETS','test','1.0.0',repeat('f',64),'1.0.0','1.0.0','CONTROL');

set role app_server;
select private.acquire_match_lease_g3('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001',null,null,15000);
do $$begin if private.apply_match_command_g3('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',repeat('a',64),'90000000-0000-4000-8000-000000000001',1,'{"type":"APPLIED"}','{"phase":"PLAYING"}','timer-1',10,'effect-1',null)->>'eventSeq'<>'1' then raise exception 'APPLY_FAILED';end if;end$$;
do $$begin if private.apply_match_command_g3('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002',repeat('a',64),'90000000-0000-4000-8000-000000000001',1,'{"type":"APPLIED"}','{"phase":"PLAYING"}','timer-1',10,'effect-1',null)->>'effectId'<>'effect-1' then raise exception 'REPLAY_FAILED';end if;end$$;
do $$begin perform private.apply_match_command_g3('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003',repeat('b',64),'90000000-0000-4000-8000-000000000001',1,'{}','{}','timer-2',20,'effect-2','AFTER_JOURNAL');raise exception 'FAULT_NOT_RAISED';exception when others then if sqlerrm<>'INJECTED_AFTER_JOURNAL' then raise;end if;end$$;
reset role;
select pass('atomic command applies');select pass('completed request replays');select pass('fault rolls back transaction');
select is((select count(*)::int from private.g3_journal where match_id='90000000-0000-4000-8000-000000000001'),1,'fault leaves no journal');
select is((select count(*)::int from private.g3_effect_outbox where match_id='90000000-0000-4000-8000-000000000001'),1,'effect and journal exactly once');
select extensions.ok((select status='COMPLETED' and response is not null from private.g3_command_receipts where request_id='90000000-0000-4000-8000-000000000002'),'receipt completes atomically');
select * from finish();rollback;
