-- Story 4.3 — retraits idempotents sans perdre la preuve du rejeu.

create table if not exists library.library_membership_removal_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  target_type text not null check (target_type in ('group', 'theme')),
  target_id uuid not null,
  copy_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

alter table library.library_membership_removal_receipts enable row level security;
alter table library.library_membership_removal_receipts force row level security;
create policy own_library_membership_removal_receipts on library.library_membership_removal_receipts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert on library.library_membership_removal_receipts to authenticated;
