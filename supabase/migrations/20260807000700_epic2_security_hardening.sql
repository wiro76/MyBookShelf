-- Epic 2 review hardening: ownership, retention and deterministic replays.

alter table media.media_assets
  add column if not exists retention_until timestamptz;

alter table media.media_assets
  drop constraint if exists media_assets_pixel_limit_check;

alter table media.media_assets
  add constraint media_assets_pixel_limit_check
  check ((width::bigint * height::bigint) <= 40000000);

alter table media.media_variants
  drop constraint if exists media_variants_pixel_limit_check;

alter table media.media_variants
  add constraint media_variants_pixel_limit_check
  check ((width::bigint * height::bigint) <= 40000000);

create or replace function media.record_personal_cover_receipt(
  p_user_id uuid, p_command_id uuid, p_request_sha256 text, p_asset_id uuid, p_created_at timestamptz
)
returns void language plpgsql security definer set search_path = media, public
as $$
declare existing media.personal_cover_receipts;
begin
  if auth.uid() is null or p_user_id <> auth.uid() then
    raise exception 'MEDIA_UNAUTHORIZED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from media.media_assets a
    where a.id = p_asset_id and a.user_id = auth.uid()
  ) then
    raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into existing
  from media.personal_cover_receipts
  where user_id = p_user_id and command_id = p_command_id;

  if found then
    if existing.request_sha256 <> p_request_sha256 or existing.asset_id <> p_asset_id then
      raise exception 'MEDIA_COMMAND_REUSED' using errcode = 'P0001';
    end if;
    return;
  end if;

  insert into media.personal_cover_receipts(user_id, command_id, request_sha256, asset_id, created_at)
  values (p_user_id, p_command_id, p_request_sha256, p_asset_id, p_created_at);
end;
$$;

create or replace function media.guard_media_asset_state()
returns trigger language plpgsql security invoker set search_path = media, public
as $$
begin
  if old.state = 'revoked' then raise exception 'MEDIA_ALREADY_REVOKED' using errcode = 'P0001'; end if;
  if not ((old.state = 'quarantined' and new.state = 'private')
       or (old.state = 'private' and new.state = 'published' and new.rights_status = 'known'
           and coalesce(new.provenance->>'source', '') <> 'personal-upload')
       or (old.state in ('private', 'published') and new.state = 'revoked')) then
    raise exception 'MEDIA_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if new.state = 'published' and new.published_at is null then new.published_at = now(); end if;
  if new.state = 'revoked' then
    if new.revoked_at is null then new.revoked_at = now(); end if;
    new.retention_until = greatest(coalesce(new.retention_until, new.revoked_at), new.revoked_at + interval '30 days');
  end if;
  return new;
end;
$$;

create or replace function media.transition_asset_state(
  p_user_id uuid, p_asset_id uuid, p_target text, p_rights_status text default null
)
returns media.media_assets language plpgsql security definer set search_path = media, public
as $$
declare result media.media_assets;
begin
  if auth.uid() is null or p_user_id <> auth.uid() then
    raise exception 'MEDIA_UNAUTHORIZED' using errcode = '42501';
  end if;

  update media.media_assets
     set state = p_target,
         rights_status = coalesce(p_rights_status, rights_status),
         rights_confirmed_at = case when p_rights_status = 'known' then coalesce(rights_confirmed_at, now()) else rights_confirmed_at end
   where id = p_asset_id and user_id = auth.uid()
   returning * into result;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function media.claim_gc_candidate(
  p_asset_id uuid, p_command_id uuid, p_now timestamptz default now()
)
returns table(asset_id uuid, decision text, object_hashes text[]) language plpgsql security definer set search_path = media, public
as $$
declare
  asset_row media.media_assets;
  hashes text[];
  result_decision text;
  effective_now timestamptz := least(coalesce(p_now, clock_timestamp()), clock_timestamp());
  existing media.gc_claims;
begin
  select * into asset_row from media.media_assets where id = p_asset_id for update;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002'; end if;
  if auth.uid() is null or asset_row.user_id <> auth.uid() then
    raise exception 'MEDIA_UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into existing from media.gc_claims where asset_id = p_asset_id;
  if found then
    if existing.command_id <> p_command_id then
      raise exception 'GC_CLAIM_EXISTS' using errcode = 'P0001';
    end if;
    select array_agg(hash order by hash) into hashes from (
      select asset_row.original_sha256 as hash
      union select v.sha256 from media.media_variants v where v.asset_id = p_asset_id
    ) hashes_source;
    return query select p_asset_id, existing.decision, coalesce(hashes, '{}'::text[]);
    return;
  end if;

  if exists (select 1 from media.gc_claims where command_id = p_command_id) then
    raise exception 'GC_COMMAND_REUSED' using errcode = 'P0001';
  end if;

  select array_agg(hash order by hash) into hashes from (
    select asset_row.original_sha256 as hash
    union select v.sha256 from media.media_variants v where v.asset_id = p_asset_id
  ) hashes_source;
  if asset_row.state <> 'revoked' or coalesce(asset_row.retention_until, asset_row.revoked_at + interval '30 days', 'infinity'::timestamptz) > effective_now then
    result_decision := 'retention-active';
  elsif exists (select 1 from media.asset_references r where r.asset_id = p_asset_id) then
    result_decision := 'referenced';
  elsif exists (select 1 from media.backup_manifest_objects b where b.object_sha256 = any(hashes) and b.retained_until > effective_now) then
    result_decision := 'backup-retained';
  else
    result_decision := 'eligible';
  end if;

  insert into media.gc_claims(asset_id, command_id, decision, claimed_at)
  values (p_asset_id, p_command_id, result_decision, effective_now);
  return query select p_asset_id, result_decision, coalesce(hashes, '{}'::text[]);
end;
$$;
