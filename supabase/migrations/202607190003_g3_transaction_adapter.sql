do $$begin execute format('grant game_security_owner to %I',current_user);end$$;
create table private.g3_command_receipts(
 match_id uuid not null, request_id uuid not null, request_hash text not null check(request_hash~'^[0-9a-f]{64}$'),
 fence bigint not null default 1, status text not null check(status in('PENDING','COMPLETED')), response jsonb,
 primary key(match_id,request_id), check((status='PENDING' and response is null) or (status='COMPLETED' and jsonb_typeof(response)='object'))
);
create table private.g3_journal(match_id uuid not null,event_seq bigint not null,request_id uuid not null,event jsonb not null check(jsonb_typeof(event)='object'),primary key(match_id,event_seq),unique(match_id,request_id));
create table private.g3_snapshots(match_id uuid primary key,state_revision bigint not null,state jsonb not null check(jsonb_typeof(state)='object'));
create table private.g3_timer_intents(match_id uuid not null,timer_id text not null,due_at_ms bigint not null,payload jsonb not null,primary key(match_id,timer_id));
create table private.g3_effect_outbox(effect_id text primary key,match_id uuid not null,request_id uuid not null,payload jsonb not null,created_at timestamptz not null default clock_timestamp(),unique(match_id,request_id));

create function private.apply_match_command_g3(p_match uuid,p_request uuid,p_hash text,p_expected_fence bigint,p_event jsonb,p_state jsonb,p_timer_id text,p_due_at bigint,p_effect_id text,p_fault text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare r private.g3_command_receipts%rowtype;seq bigint;result jsonb;begin
 insert into private.g3_command_receipts(match_id,request_id,request_hash,fence,status) values(p_match,p_request,p_hash,p_expected_fence,'PENDING') on conflict do nothing;
 select * into r from private.g3_command_receipts where match_id=p_match and request_id=p_request for update;
 if r.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 if r.status='COMPLETED' then return r.response;end if;
 if r.fence<>p_expected_fence then raise exception 'STALE_FENCE';end if;
 if p_fault='AFTER_CLAIM' then raise exception 'INJECTED_AFTER_CLAIM';end if;
 select coalesce(max(event_seq),0)+1 into seq from private.g3_journal where match_id=p_match;
 insert into private.g3_journal values(p_match,seq,p_request,p_event);
 if p_fault='AFTER_JOURNAL' then raise exception 'INJECTED_AFTER_JOURNAL';end if;
 insert into private.g3_snapshots values(p_match,seq,p_state) on conflict(match_id) do update set state_revision=excluded.state_revision,state=excluded.state;
 insert into private.g3_timer_intents values(p_match,p_timer_id,p_due_at,p_event) on conflict(match_id,timer_id) do update set due_at_ms=excluded.due_at_ms,payload=excluded.payload;
 insert into private.g3_effect_outbox values(p_effect_id,p_match,p_request,p_event,clock_timestamp());
 if p_fault='AFTER_EFFECT' then raise exception 'INJECTED_AFTER_EFFECT';end if;
 result:=jsonb_build_object('eventSeq',seq,'stateRevision',seq,'effectId',p_effect_id);
 update private.g3_command_receipts set status='COMPLETED',response=result where match_id=p_match and request_id=p_request and fence=p_expected_fence;
 return result;
end$$;
alter table private.g3_command_receipts owner to game_security_owner;alter table private.g3_journal owner to game_security_owner;alter table private.g3_snapshots owner to game_security_owner;alter table private.g3_timer_intents owner to game_security_owner;alter table private.g3_effect_outbox owner to game_security_owner;
alter function private.apply_match_command_g3(uuid,uuid,text,bigint,jsonb,jsonb,text,bigint,text,text) owner to game_security_owner;
revoke all on private.g3_command_receipts,private.g3_journal,private.g3_snapshots,private.g3_timer_intents,private.g3_effect_outbox from public,anon,authenticated,service_role,app_server,deployment_role;
revoke execute on function private.apply_match_command_g3(uuid,uuid,text,bigint,jsonb,jsonb,text,bigint,text,text) from public,anon,authenticated,service_role,deployment_role;
grant execute on function private.apply_match_command_g3(uuid,uuid,text,bigint,jsonb,jsonb,text,bigint,text,text) to app_server;
do $$begin execute format('revoke game_security_owner from %I',current_user);end$$;
