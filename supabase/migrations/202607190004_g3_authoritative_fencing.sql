do $$begin execute format('grant game_security_owner to %I',current_user);end$$;
create table private.g3_match_leases(match_id uuid primary key,owner_token uuid not null,fence bigint not null check(fence>0),next_event_seq bigint not null default 1 check(next_event_seq>0));
create function private.acquire_match_lease_g3(p_match uuid,p_owner uuid) returns bigint language plpgsql security definer set search_path=pg_catalog as $$declare v bigint;begin
 insert into private.g3_match_leases(match_id,owner_token,fence) values(p_match,p_owner,1) on conflict(match_id) do update set owner_token=excluded.owner_token,fence=case when private.g3_match_leases.owner_token=excluded.owner_token then private.g3_match_leases.fence else private.g3_match_leases.fence+1 end returning fence into v;return v;
end$$;
create or replace function private.apply_match_command_g3(p_match uuid,p_request uuid,p_hash text,p_expected_fence bigint,p_event jsonb,p_state jsonb,p_timer_id text,p_due_at bigint,p_effect_id text,p_fault text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare r private.g3_command_receipts%rowtype;l private.g3_match_leases%rowtype;seq bigint;result jsonb;begin
 select * into l from private.g3_match_leases where match_id=p_match for update;
 if not found or l.fence<>p_expected_fence then raise exception 'STALE_FENCE';end if;
 insert into private.g3_command_receipts(match_id,request_id,request_hash,fence,status) values(p_match,p_request,p_hash,l.fence,'PENDING') on conflict do nothing;
 select * into r from private.g3_command_receipts where match_id=p_match and request_id=p_request for update;
 if r.fence<>l.fence then raise exception 'STALE_FENCE';end if;
 if r.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 if r.status='COMPLETED' then return r.response;end if;
 if p_fault='AFTER_CLAIM' then raise exception 'INJECTED_AFTER_CLAIM';end if;
 seq:=l.next_event_seq;update private.g3_match_leases set next_event_seq=next_event_seq+1 where match_id=p_match and fence=l.fence;
 insert into private.g3_journal values(p_match,seq,p_request,p_event);
 if p_fault='AFTER_JOURNAL' then raise exception 'INJECTED_AFTER_JOURNAL';end if;
 insert into private.g3_snapshots values(p_match,seq,p_state) on conflict(match_id) do update set state_revision=excluded.state_revision,state=excluded.state;
 insert into private.g3_timer_intents values(p_match,p_timer_id,p_due_at,p_event) on conflict(match_id,timer_id) do update set due_at_ms=excluded.due_at_ms,payload=excluded.payload;
 insert into private.g3_effect_outbox values(p_effect_id,p_match,p_request,p_event,clock_timestamp());
 if p_fault='AFTER_EFFECT' then raise exception 'INJECTED_AFTER_EFFECT';end if;
 result:=jsonb_build_object('eventSeq',seq,'stateRevision',seq,'effectId',p_effect_id);
 update private.g3_command_receipts set status='COMPLETED',response=result where match_id=p_match and request_id=p_request and fence=l.fence;return result;
end$$;
alter table private.g3_match_leases owner to game_security_owner;alter function private.acquire_match_lease_g3(uuid,uuid) owner to game_security_owner;
revoke all on private.g3_match_leases from public,anon,authenticated,service_role,app_server,deployment_role;
revoke execute on function private.acquire_match_lease_g3(uuid,uuid) from public,anon,authenticated,service_role,deployment_role;grant execute on function private.acquire_match_lease_g3(uuid,uuid) to app_server;
do $$begin execute format('revoke game_security_owner from %I',current_user);end$$;
