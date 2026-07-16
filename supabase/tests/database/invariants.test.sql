begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_eq(
  $$select enumlabel from pg_enum join pg_type on pg_type.oid=enumtypid where typname='match_status' and typnamespace='public'::regnamespace$$,
  $$values ('WAITING_FOR_ASSETS'),('COUNTDOWN'),('PLAYING'),('FINAL_RUSH'),('SETTLING'),('TIEBREAK_EVAL'),('SUDDEN_DEATH'),('FINISHED'),('CANCELLED')$$,
  'persisted match phases exactly match contract'
);
select col_not_null('public', 'matches', 'content_revision_id', 'match pins content revision');
select col_not_null('public', 'matches', 'ruleset_version', 'match pins ruleset version');
select col_not_null('public', 'matches', 'ruleset_hash', 'match pins ruleset hash');
select col_not_null('public', 'matches', 'engine_version', 'match pins engine version');
select col_not_null('public', 'matches', 'protocol_version', 'match pins protocol version');
select has_index('public', 'user_pets', 'user_pets_one_selected_per_user', 'selected pet is partial unique');
select has_table('private', 'match_request_receipts', 'private request receipts exist');
select has_table('private', 'match_command_receipts', 'private command receipts exist');
select has_table('private', 'match_events', 'private append-only events exist');

insert into auth.users(id, aud, role, email) values
 ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','one@example.test'),
 ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','two@example.test'),
 ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','three@example.test');
insert into public.profiles(id,nickname) values
 ('10000000-0000-4000-8000-000000000001','one'),
 ('10000000-0000-4000-8000-000000000002','two'),
 ('10000000-0000-4000-8000-000000000003','three');
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
values ('30000000-0000-4000-8000-000000000001','ffffffff-ffff-4fff-8fff-ffffffffffff','WAITING_FOR_ASSETS','test','1.0.0',repeat('f',64),'1.0.0','1.0.0','CONTROL');

set local role app_server;
do $$
begin
  begin
    perform private.join_match_participant_v1('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
    raise exception 'AUTH_UUID_ACCEPTED_AS_PARTICIPANT_KEY';
  exception when sqlstate '22023' then
    if sqlerrm <> 'PARTICIPANT_KEY_INVALID' then raise; end if;
  end;
  if not private.join_match_participant_v1('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001') then raise exception 'FIRST_JOIN_REJECTED'; end if;
  if not private.join_match_participant_v1('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002') then raise exception 'SECOND_JOIN_REJECTED'; end if;
  if private.join_match_participant_v1('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003') then raise exception 'THIRD_JOIN_ACCEPTED'; end if;
end
$$;
reset role;
select pass('auth UUID cannot be reused as participant key');
select pass('first participant joins');
select pass('second participant joins');
select pass('third participant is rejected');
select is((select count(*)::int from public.match_players where match_id='30000000-0000-4000-8000-000000000001'), 2, 'match has at most two participants');

update public.matches set winner_participant_key='40000000-0000-4000-8000-000000000001', status='FINISHED', end_reason='SCORE_TARGET', ended_at=now() where id='30000000-0000-4000-8000-000000000001';
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
select is((select user_id from public.match_players where match_id='30000000-0000-4000-8000-000000000001' and participant_key='40000000-0000-4000-8000-000000000001'), null::uuid, 'account deletion nulls participant auth mapping');
select is((select winner_participant_key from public.matches where id='30000000-0000-4000-8000-000000000001'), '40000000-0000-4000-8000-000000000001'::uuid, 'winner remains replayable by participant key');

insert into private.match_request_receipts(match_id,participant_key,request_id,request_hash,status,owner_token,lease_until)
values ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',repeat('5',64),'PENDING','60000000-0000-4000-8000-000000000001',now()+interval '1 minute');
select throws_ok(
  $$update private.match_request_receipts set request_hash=repeat('6',64),status='COMPLETED',response_status=200,response_body='{}',owner_token=null,lease_until=null,completed_at=now() where request_id='50000000-0000-4000-8000-000000000001'$$,
  'P0001', 'INVALID_REQUEST_RECEIPT_TRANSITION', 'request identity and hash cannot change during completion'
);
update private.match_request_receipts set status='COMPLETED',response_status=429,response_body='{"code":"RATE_LIMITED"}',owner_token=null,lease_until=null,completed_at=now() where request_id='50000000-0000-4000-8000-000000000001';
select is((select status from private.match_request_receipts where request_id='50000000-0000-4000-8000-000000000001'), 'COMPLETED', 'sequencing-free rejection stores a non-null ack');

insert into private.match_command_receipts(match_id, command_seq, command_id, source, command_hash, decision, received_at)
values ('30000000-0000-4000-8000-000000000001',1,'system:test','SYSTEM',repeat('1',64),'APPLIED',now());
select throws_ok(
  $$insert into private.match_command_receipts(match_id, command_seq, command_id, source, command_hash, decision, received_at) values ('30000000-0000-4000-8000-000000000001',2,'시스템','SYSTEM',repeat('2',64),'APPLIED',now())$$,
  '23514',
  'new row for relation "match_command_receipts" violates check constraint "match_command_receipts_command_id_ascii"',
  'command IDs are printable ASCII only'
);
insert into private.match_events(event_id,match_id,event_seq,caused_by_command_seq,state_revision,phase,event_type,payload,occurred_at)
values ('30000000-0000-4000-8000-000000000001:1','30000000-0000-4000-8000-000000000001',1,1,1,'FINISHED','MATCH_FINISHED','{"winnerParticipantKey":"40000000-0000-4000-8000-000000000001"}',now());
select is((select position('10000000-0000-4000-8000-000000000001' in payload::text) + position('one' in payload::text) from private.match_events where event_seq=1), 0, 'persisted event payload contains neither deleted auth UUID nor nickname');
select throws_ok($$update private.match_events set payload='{"tampered":true}' where event_seq=1$$, 'P0001', 'IMMUTABLE_MATCH_EVENT', 'event rows are immutable');
select throws_ok($$delete from private.match_events where event_seq=1$$, 'P0001', 'IMMUTABLE_MATCH_EVENT', 'event rows cannot be deleted');

select * from finish();
rollback;
