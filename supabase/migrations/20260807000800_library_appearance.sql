-- Story 3.1 — préférence cosmétique privée, indépendante du rangement.

create table if not exists library.appearance_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  structure_id text not null check (structure_id in ('frame', 'arch', 'wide')),
  finish_id text not null check (finish_id in ('oak', 'walnut', 'white')),
  command_id uuid not null default gen_random_uuid() unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  updated_at timestamptz not null default now()
);

alter table library.appearance_preferences enable row level security;
alter table library.appearance_preferences force row level security;
drop policy if exists own_appearance_preferences on library.appearance_preferences;
create policy own_appearance_preferences on library.appearance_preferences
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on library.appearance_preferences to authenticated;
