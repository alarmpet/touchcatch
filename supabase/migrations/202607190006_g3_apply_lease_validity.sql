do $$begin execute format('grant game_security_owner to %I',current_user);end$$;
drop function private.apply_match_command_g3(uuid,uuid,text,bigint,jsonb,jsonb,text,bigint,text,text);
create function private.apply_match_command_g3(p_match uuid,p_request uuid,p_hash text,p_expected_owner uuid,p_expected_fence bigint,p_event jsonb,p_state jsonb,p_timer_id text,p_due_at bigint,p_effect_id text,p_fault text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare r private.g3_command_receipts%rowtype;l private.g3_match_leases%rowtype;seq bigint;result jsonb;begin
 select * into l from private.g3_match_leases where match_id=p_match for update;
 if not found or l.owner_token<>p_expected_owner or l.fence<>p_expected_fence or l.expires_at<=clock_timestamp() then raise exception 'STALE_LEASE';end if;
 insert into private.g3_command_receipts(match_id,request_id,request_hash,fence,status) values(p_match,p_request,p_hash,l.fence,'PENDING') on conflict do nothing;
 select * into r from private.g3_command_receipts where match_id=p_match and request_id=p_request for update;
 if r.fence<>l.fence then raise exception 'STALE_FENCE';end if;
 if r.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;
 if r.status='COMPLETED' then return r.response;end if;
 if p_fault='AFTER_CLAIM' then raise exception 'INJECTED_AFTER_CLAIM';end if;
 seq:=l.next_event_seq;update private.g3_match_leases set next_event_seq=next_event_seq+1 where match_id=p_match and owner_token=p_expected_owner and fence=l.fence and expires_at>clock_timestamp();
 if not found then raise exception 'STALE_LEASE';end if;
 insert into private.g3_journal values(p_match,seq,p_request,p_event);if p_fault='AFTER_JOURNAL' then raise exception 'INJECTED_AFTER_JOURNAL';end if;
 insert into private.g3_snapshots values(p_match,seq,p_state) on conflict(match_id) do update set state_revision=excluded.state_revision,state=excluded.state;
 insert into private.g3_timer_intents values(p_match,p_timer_id,p_due_at,p_event) on conflict(match_id,timer_id) do update set due_at_ms=excluded.due_at_ms,payload=excluded.payload;
 insert into private.g3_effect_outbox values(p_effect_id,p_match,p_request,p_event,clock_timestamp());if p_fault='AFTER_EFFECT' then raise exception 'INJECTED_AFTER_EFFECT';end if;
 result:=jsonb_build_object('eventSeq',seq,'stateRevision',seq,'effectId',p_effect_id);update private.g3_command_receipts set status='COMPLETED',response=result where match_id=p_match and request_id=p_request and fence=l.fence;return result;
end$$;
alter function private.apply_match_command_g3(uuid,uuid,text,uuid,bigint,jsonb,jsonb,text,bigint,text,text) owner to game_security_owner;
revoke execute on function private.apply_match_command_g3(uuid,uuid,text,uuid,bigint,jsonb,jsonb,text,bigint,text,text) from public,anon,authenticated,service_role,deployment_role;
grant execute on function private.apply_match_command_g3(uuid,uuid,text,uuid,bigint,jsonb,jsonb,text,bigint,text,text) to app_server;
do $$begin execute format('revoke game_security_owner from %I',current_user);end$$;
