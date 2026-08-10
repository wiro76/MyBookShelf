-- Story 2.4 — Work, Edition, intention et exemplaire canonique.

create table if not exists library.works (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique check (char_length(canonical_key) between 8 and 200),
  title text not null check (char_length(title) between 1 and 500),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'array'),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (id, canonical_key)
);

alter table library.works add column if not exists author text;
alter table library.works add column if not exists summary text;

create table if not exists library.editions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references library.works(id) on delete cascade,
  canonical_key text not null check (char_length(canonical_key) between 8 and 200),
  title text not null check (char_length(title) between 1 and 500),
  identifiers jsonb not null check (jsonb_typeof(identifiers) = 'array'),
  provenance jsonb not null check (jsonb_typeof(provenance) = 'array'),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (work_id, canonical_key),
  unique (id, work_id)
);

alter table library.editions add column if not exists metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object');

alter table library.works enable row level security;
alter table library.works force row level security;
alter table library.editions enable row level security;
alter table library.editions force row level security;

drop policy if exists authenticated_catalogue_works on library.works;
create policy authenticated_catalogue_works on library.works for select to authenticated using (true);
create policy authenticated_catalogue_works_write on library.works for insert to authenticated with check (true);
create policy authenticated_catalogue_works_update on library.works for update to authenticated using (true) with check (true);
drop policy if exists authenticated_catalogue_editions on library.editions;
create policy authenticated_catalogue_editions on library.editions for select to authenticated using (true);
create policy authenticated_catalogue_editions_write on library.editions for insert to authenticated with check (true);
create policy authenticated_catalogue_editions_update on library.editions for update to authenticated using (true) with check (true);

create table if not exists library.library_add_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  copy_id uuid not null,
  placement_id uuid not null,
  result_revision bigint not null check (result_revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id),
  foreign key (copy_id, user_id) references library.copies(id, user_id),
  foreign key (placement_id, user_id) references library.placements(id, user_id)
);

alter table library.user_works enable row level security;
alter table library.user_works force row level security;
alter table library.copies enable row level security;
alter table library.copies force row level security;
alter table library.library_add_receipts enable row level security;
alter table library.library_add_receipts force row level security;

drop policy if exists own_library_add_receipts on library.library_add_receipts;
create policy own_library_add_receipts on library.library_add_receipts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on library.user_works, library.copies to authenticated;
grant select, insert, update on library.works, library.editions to authenticated;
grant select on library.library_add_receipts to authenticated;

create or replace function library.record_library_add_receipt(
  p_user_id uuid, p_command_id uuid, p_request_sha256 text, p_copy_id uuid,
  p_placement_id uuid, p_result_revision bigint, p_created_at timestamptz
)
returns void language sql security definer set search_path = library, public
as $$
  insert into library.library_add_receipts (user_id, command_id, request_sha256, copy_id, placement_id, result_revision, created_at)
  values (p_user_id, p_command_id, p_request_sha256, p_copy_id, p_placement_id, p_result_revision, p_created_at);
$$;
revoke all on function library.record_library_add_receipt(uuid, uuid, text, uuid, uuid, bigint, timestamptz) from public, anon;
grant execute on function library.record_library_add_receipt(uuid, uuid, text, uuid, uuid, bigint, timestamptz) to authenticated;
revoke insert on library.library_add_receipts from authenticated;

create index if not exists library_editions_work_idx on library.editions (work_id);
create index if not exists library_add_receipts_copy_idx on library.library_add_receipts (user_id, copy_id);
