create table if not exists media.backup_manifest_objects (
  object_sha256 text primary key check (object_sha256 ~ '^[0-9a-f]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  retained_until timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table if not exists media.gc_claims (
  asset_id uuid primary key references media.media_assets(id) on delete restrict,
  command_id uuid not null unique,
  decision text not null check (decision in ('eligible', 'referenced', 'backup-retained', 'retention-active')),
  claimed_at timestamptz not null default now()
);

alter table media.backup_manifest_objects enable row level security;
alter table media.backup_manifest_objects force row level security;
alter table media.gc_claims enable row level security;
alter table media.gc_claims force row level security;
create policy own_gc_claims on media.gc_claims for select to authenticated using (exists (select 1 from media.media_assets a where a.id = asset_id and a.user_id = (select auth.uid())));
grant select on media.gc_claims to authenticated;
revoke all on media.backup_manifest_objects from public, anon, authenticated;
revoke insert, update, delete on media.gc_claims from authenticated;

create or replace function media.claim_gc_candidate(p_asset_id uuid, p_command_id uuid, p_now timestamptz default now())
returns table(asset_id uuid, decision text, object_hashes text[]) language plpgsql security definer set search_path = media, public
as $$
declare asset_row media.media_assets; hashes text[]; result_decision text;
begin
  select * into asset_row from media.media_assets where id = p_asset_id for update;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002'; end if;
  select array_agg(hash order by hash) into hashes from (
    select asset_row.original_sha256 as hash
    union
    select v.sha256 from media.media_variants v where v.asset_id = p_asset_id
  ) hashes_source;
  if asset_row.state <> 'revoked' then result_decision := 'retention-active';
  elsif exists (select 1 from media.asset_references r where r.asset_id = p_asset_id) then result_decision := 'referenced';
  elsif exists (select 1 from media.backup_manifest_objects b where b.object_sha256 = any(hashes) and b.retained_until > p_now) then result_decision := 'backup-retained';
  elsif asset_row.revoked_at is null then result_decision := 'retention-active';
  else result_decision := 'eligible'; end if;
  insert into media.gc_claims(asset_id, command_id, decision, claimed_at) values (p_asset_id, p_command_id, result_decision, p_now)
    on conflict (asset_id) do update set decision = excluded.decision, command_id = excluded.command_id, claimed_at = excluded.claimed_at;
  return query select p_asset_id, result_decision, coalesce(hashes, '{}'::text[]);
end;
$$;

revoke all on function media.claim_gc_candidate(uuid, uuid, timestamptz) from public, anon;
grant execute on function media.claim_gc_candidate(uuid, uuid, timestamptz) to authenticated;
