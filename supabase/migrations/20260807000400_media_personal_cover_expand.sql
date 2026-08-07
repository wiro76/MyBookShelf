create schema if not exists media;

create table if not exists media.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type = 'cover'),
  state text not null check (state in ('quarantined', 'private')),
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  original_bytes bigint not null check (original_bytes between 1 and 20971520),
  width integer not null check (width between 1 and 40000000),
  height integer not null check (height between 1 and 40000000 and width * height <= 40000000),
  original_object_key text not null,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, original_sha256)
);

create table if not exists media.media_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references media.media_assets(id) on delete cascade,
  variant_kind text not null check (variant_kind = 'private-webp'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_key text not null,
  mime_type text not null check (mime_type = 'image/webp'),
  width integer not null check (width between 1 and 40000000),
  height integer not null check (height between 1 and 40000000 and width * height <= 40000000),
  created_at timestamptz not null default now(),
  unique (asset_id, variant_kind),
  unique (sha256)
);

create table if not exists media.personal_cover_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  asset_id uuid not null references media.media_assets(id),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

alter table media.media_assets enable row level security;
alter table media.media_assets force row level security;
alter table media.media_variants enable row level security;
alter table media.media_variants force row level security;
alter table media.personal_cover_receipts enable row level security;
alter table media.personal_cover_receipts force row level security;

create policy own_media_assets on media.media_assets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_media_variants on media.media_variants for all to authenticated using (exists (select 1 from media.media_assets a where a.id = asset_id and a.user_id = (select auth.uid()))) with check (exists (select 1 from media.media_assets a where a.id = asset_id and a.user_id = (select auth.uid())));
create policy own_personal_cover_receipts on media.personal_cover_receipts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on media.media_assets, media.media_variants, media.personal_cover_receipts to authenticated;
revoke insert, update, delete on media.media_assets, media.media_variants, media.personal_cover_receipts from authenticated;

create or replace function media.record_personal_cover_receipt(p_user_id uuid, p_command_id uuid, p_request_sha256 text, p_asset_id uuid, p_created_at timestamptz)
returns void language sql security definer set search_path = media, public
as $$ insert into media.personal_cover_receipts(user_id, command_id, request_sha256, asset_id, created_at) values (p_user_id, p_command_id, p_request_sha256, p_asset_id, p_created_at); $$;
revoke all on function media.record_personal_cover_receipt(uuid, uuid, text, uuid, timestamptz) from public, anon;
grant execute on function media.record_personal_cover_receipt(uuid, uuid, text, uuid, timestamptz) to authenticated;
