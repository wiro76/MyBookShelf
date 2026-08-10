-- Story 4.3 — regroupements transversaux et thèmes indépendants des placements.

create table if not exists library.library_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  group_order integer not null default 0 check (group_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists library.library_group_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references library.library_groups(id) on delete cascade,
  copy_id uuid not null references library.copies(id) on delete cascade,
  member_order integer not null check (member_order >= 0),
  primary key (group_id, copy_id)
);

create table if not exists library.library_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  label text not null check (char_length(label) between 1 and 120),
  icon text check (icon is null or char_length(icon) between 1 and 80),
  pattern text check (pattern is null or char_length(pattern) between 1 and 80),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists library.library_theme_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  theme_id uuid not null references library.library_themes(id) on delete cascade,
  copy_id uuid not null references library.copies(id) on delete cascade,
  primary key (theme_id, copy_id)
);

create table if not exists library.library_group_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  group_id uuid not null references library.library_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

create table if not exists library.library_theme_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  theme_id uuid not null references library.library_themes(id) on delete cascade,
  command_type text not null check (command_type in ('create', 'assign')),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

alter table library.library_groups enable row level security;
alter table library.library_groups force row level security;
alter table library.library_group_members enable row level security;
alter table library.library_group_members force row level security;
alter table library.library_themes enable row level security;
alter table library.library_themes force row level security;
alter table library.library_theme_members enable row level security;
alter table library.library_theme_members force row level security;
alter table library.library_group_receipts enable row level security;
alter table library.library_group_receipts force row level security;
alter table library.library_theme_receipts enable row level security;
alter table library.library_theme_receipts force row level security;

create policy own_library_groups on library.library_groups for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_library_group_members on library.library_group_members for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_library_themes on library.library_themes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_library_theme_members on library.library_theme_members for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_library_group_receipts on library.library_group_receipts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_library_theme_receipts on library.library_theme_receipts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on library.library_groups, library.library_group_members, library.library_themes, library.library_theme_members to authenticated;
grant select, insert on library.library_group_receipts, library.library_theme_receipts to authenticated;
