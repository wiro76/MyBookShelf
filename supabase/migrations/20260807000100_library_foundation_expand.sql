-- Story 2.3 — projection canonique du rangement réel.
-- L'initialisation applicative crée uniquement Module/Shelf. Les autres tables existent
-- pour que les stories de mutation suivantes réutilisent les mêmes clés et invariants.

create schema if not exists library;

create table if not exists library.user_works (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null,
  intention text not null check (intention in ('want-to-read', 'reading', 'finished')),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (user_id, work_id)
);

create table if not exists library.copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id uuid not null,
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists library.modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('want-to-read', 'reading', 'finished')),
  module_position integer not null check (module_position >= 0),
  shelf_count integer not null default 5 check (shelf_count > 0 and shelf_count <= 64),
  capacity_units integer not null default 20 check (capacity_units > 0 and capacity_units <= 1000),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (user_id, status, module_position),
  unique (id, user_id)
);

create table if not exists library.shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null,
  shelf_position integer not null check (shelf_position >= 0),
  capacity_units integer not null default 20 check (capacity_units > 0 and capacity_units <= 1000),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (module_id, shelf_position),
  unique (id, user_id),
  foreign key (module_id, user_id) references library.modules(id, user_id) on delete cascade
);

create table if not exists library.placements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('want-to-read', 'reading', 'finished')),
  shelf_id uuid not null,
  module_id uuid not null,
  copy_id uuid not null,
  item_position integer not null check (item_position >= 0),
  width_units integer not null default 1 check (width_units > 0 and width_units <= 1000),
  version bigint not null default 1 check (version between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (copy_id),
  unique (shelf_id, item_position),
  unique (id, user_id),
  foreign key (shelf_id, user_id) references library.shelves(id, user_id),
  foreign key (module_id, user_id) references library.modules(id, user_id),
  foreign key (copy_id, user_id) references library.copies(id, user_id)
);

create table if not exists library.placement_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  placement_id uuid,
  result_revision bigint not null check (result_revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

create index if not exists library_modules_user_status_idx on library.modules (user_id, status, module_position);
create index if not exists library_shelves_module_idx on library.shelves (user_id, module_id, shelf_position);
create index if not exists library_placements_shelf_idx on library.placements (user_id, shelf_id, item_position);

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array['user_works', 'copies', 'modules', 'shelves', 'placements', 'placement_receipts'] loop
    execute format('alter table library.%I enable row level security', relation_name);
    execute format('alter table library.%I force row level security', relation_name);
    execute format('drop policy if exists own_%I on library.%I', relation_name, relation_name);
    execute format('create policy own_%I on library.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', relation_name, relation_name);
  end loop;
end $$;

revoke all on schema library from public, anon;
grant usage on schema library to authenticated;
grant select, insert, update on library.user_works, library.copies, library.modules, library.shelves, library.placements to authenticated;
grant select, insert on library.placement_receipts to authenticated;
