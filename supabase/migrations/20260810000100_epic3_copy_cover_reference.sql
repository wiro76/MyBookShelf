-- Story 3.5 — relier une couverture personnelle à un exemplaire sans croiser les utilisateurs.

insert into storage.buckets (id, name, public)
values ('media-private', 'media-private', false)
on conflict (id) do update set public = false;

alter table library.copies
  add column if not exists preferred_cover_asset_id uuid;

alter table library.copies
  drop constraint if exists copies_preferred_cover_asset_owner_fk;

alter table library.copies
  add constraint copies_preferred_cover_asset_owner_fk
  foreign key (preferred_cover_asset_id, user_id)
  references media.media_assets (id, user_id)
  on delete restrict;

create index if not exists library_copies_preferred_cover_idx
  on library.copies (user_id, preferred_cover_asset_id)
  where preferred_cover_asset_id is not null;

create or replace function library.set_copy_preferred_cover(
  p_user_id uuid,
  p_copy_id uuid,
  p_asset_id uuid default null
)
returns library.copies
language plpgsql
security definer
set search_path = library, media, public
as $$
declare
  result library.copies;
begin
  if auth.uid() is null or p_user_id <> auth.uid() then
    raise exception 'LIBRARY_UNAUTHORIZED' using errcode = '42501';
  end if;

  if p_asset_id is not null and not exists (
    select 1 from media.media_assets assets
    where assets.id = p_asset_id
      and assets.user_id = p_user_id
      and assets.state in ('private', 'published')
  ) then
    raise exception 'LIBRARY_COVER_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  update library.copies
     set preferred_cover_asset_id = p_asset_id,
         version = version + 1
   where id = p_copy_id and user_id = p_user_id
   returning * into result;

  if not found then
    raise exception 'LIBRARY_COPY_NOT_FOUND' using errcode = 'P0002';
  end if;

  delete from media.asset_references
   where user_id = p_user_id
     and reference_type = 'copy'
     and reference_id = p_copy_id;

  if p_asset_id is not null then
    insert into media.asset_references (asset_id, user_id, reference_type, reference_id)
    values (p_asset_id, p_user_id, 'copy', p_copy_id);
  end if;

  return result;
end;
$$;

revoke all on function library.set_copy_preferred_cover(uuid, uuid, uuid) from public, anon;
grant execute on function library.set_copy_preferred_cover(uuid, uuid, uuid) to authenticated;
