alter table media.media_assets drop constraint if exists media_assets_state_check;
alter table media.media_assets add constraint media_assets_state_check check (state in ('quarantined', 'private', 'published', 'revoked'));
alter table media.media_assets add column if not exists rights_status text not null default 'unknown' check (rights_status in ('known', 'unknown'));
alter table media.media_assets add column if not exists rights_confirmed_at timestamptz;
alter table media.media_assets add column if not exists published_at timestamptz;
alter table media.media_assets add column if not exists revoked_at timestamptz;
alter table media.media_assets add constraint media_assets_id_user_key unique (id, user_id);

create table if not exists media.asset_references (
  asset_id uuid not null references media.media_assets(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_type text not null check (reference_type in ('work', 'edition', 'user-work', 'copy')),
  reference_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (asset_id, reference_type, reference_id),
  foreign key (asset_id, user_id) references media.media_assets(id, user_id)
);

alter table media.asset_references enable row level security;
alter table media.asset_references force row level security;
create policy own_asset_references on media.asset_references for select to authenticated using ((select auth.uid()) = user_id);
grant select on media.asset_references to authenticated;
revoke insert, update, delete on media.asset_references from authenticated;

create or replace function media.guard_media_asset_state()
returns trigger language plpgsql security invoker set search_path = media, public
as $$
begin
  if old.state = 'revoked' then raise exception 'MEDIA_ALREADY_REVOKED' using errcode = 'P0001'; end if;
  if not ((old.state = 'quarantined' and new.state = 'private')
       or (old.state = 'private' and new.state = 'published' and new.rights_status = 'known')
       or (old.state in ('private', 'published') and new.state = 'revoked')) then
    raise exception 'MEDIA_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if new.state = 'published' and new.published_at is null then new.published_at = now(); end if;
  if new.state = 'revoked' and new.revoked_at is null then new.revoked_at = now(); end if;
  return new;
end;
$$;

drop trigger if exists media_assets_guard_state on media.media_assets;
create trigger media_assets_guard_state before update of state on media.media_assets for each row execute function media.guard_media_asset_state();

create or replace function media.transition_asset_state(p_user_id uuid, p_asset_id uuid, p_target text, p_rights_status text default null)
returns media.media_assets language plpgsql security definer set search_path = media, public
as $$
declare result media.media_assets;
begin
  update media.media_assets
     set state = p_target,
         rights_status = coalesce(p_rights_status, rights_status),
         rights_confirmed_at = case when p_rights_status = 'known' then coalesce(rights_confirmed_at, now()) else rights_confirmed_at end
   where id = p_asset_id and user_id = p_user_id
   returning * into result;
  if not found then raise exception 'MEDIA_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

revoke all on function media.transition_asset_state(uuid, uuid, text, text) from public, anon;
grant execute on function media.transition_asset_state(uuid, uuid, text, text) to authenticated;
