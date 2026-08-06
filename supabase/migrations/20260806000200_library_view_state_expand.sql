create schema if not exists library;

revoke all on schema library from public, anon;
grant usage on schema library to authenticated;

create table library.library_view_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('want-to-read', 'finished', 'reading')),
  module_id uuid,
  shelf_id uuid,
  copy_id uuid,
  module_position integer,
  shelf_position integer,
  item_position integer,
  revision bigint not null check (revision between 1 and 9007199254740991),
  confirmed_at timestamptz not null default now(),
  constraint library_view_state_module_pair check ((module_id is null) = (module_position is null)),
  constraint library_view_state_shelf_pair check ((shelf_id is null) = (shelf_position is null)),
  constraint library_view_state_copy_pair check ((copy_id is null) = (item_position is null)),
  constraint library_view_state_hierarchy check (
    (shelf_id is null or module_id is not null) and
    (copy_id is null or shelf_id is not null)
  ),
  constraint library_view_state_positions check (
    (module_position is null or module_position >= 0) and
    (shelf_position is null or shelf_position >= 0) and
    (item_position is null or item_position >= 0)
  )
);

create table library.library_view_state_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  result_revision bigint not null check (result_revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

alter table library.library_view_states enable row level security;
alter table library.library_view_states force row level security;
alter table library.library_view_state_receipts enable row level security;
alter table library.library_view_state_receipts force row level security;

create policy own_library_view_state
on library.library_view_states
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy own_library_view_state_receipts
on library.library_view_state_receipts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on library.library_view_states to authenticated;
grant select, insert on library.library_view_state_receipts to authenticated;
