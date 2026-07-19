do $$begin execute format('grant game_security_owner to %I',current_user);end$$;
drop function private.acquire_match_lease_g3(uuid,uuid);
alter table private.g3_match_leases add column expires_at timestamptz;
update private.g3_match_leases set expires_at=clock_timestamp();
alter table private.g3_match_leases alter column expires_at set not null;
create function private.acquire_match_lease_g3(p_match uuid,p_new_owner uuid,p_expected_owner uuid,p_expected_fence bigint,p_lease_ms integer) returns bigint
language plpgsql security definer set search_path=pg_catalog as $$declare l private.g3_match_leases%rowtype;v bigint;now_at timestamptz:=clock_timestamp();begin
 if p_lease_ms<100 or p_lease_ms>60000 then raise exception 'INVALID_LEASE_DURATION';end if;
 select * into l from private.g3_match_leases where match_id=p_match for update;
 if not found then
  if p_expected_owner is not null or p_expected_fence is not null then raise exception 'LEASE_CAS_MISMATCH';end if;
  insert into private.g3_match_leases(match_id,owner_token,fence,next_event_seq,expires_at) values(p_match,p_new_owner,1,1,now_at+(p_lease_ms::text||' milliseconds')::interval) returning fence into v;return v;
 end if;
 if l.owner_token=p_new_owner then
  if p_expected_owner is distinct from l.owner_token or p_expected_fence is distinct from l.fence then raise exception 'LEASE_CAS_MISMATCH';end if;
  update private.g3_match_leases set expires_at=now_at+(p_lease_ms::text||' milliseconds')::interval where match_id=p_match returning fence into v;return v;
 end if;
 if l.expires_at>now_at and (p_expected_owner is distinct from l.owner_token or p_expected_fence is distinct from l.fence) then raise exception 'LEASE_HELD';end if;
 if l.expires_at<=now_at and p_expected_fence is distinct from l.fence then raise exception 'LEASE_CAS_MISMATCH';end if;
 update private.g3_match_leases set owner_token=p_new_owner,fence=fence+1,expires_at=now_at+(p_lease_ms::text||' milliseconds')::interval where match_id=p_match returning fence into v;return v;
end$$;
alter function private.acquire_match_lease_g3(uuid,uuid,uuid,bigint,integer) owner to game_security_owner;
revoke execute on function private.acquire_match_lease_g3(uuid,uuid,uuid,bigint,integer) from public,anon,authenticated,service_role,deployment_role;
grant execute on function private.acquire_match_lease_g3(uuid,uuid,uuid,bigint,integer) to app_server;
do $$begin execute format('revoke game_security_owner from %I',current_user);end$$;
