-- Story 4.2 — idempotence dédiée aux déplacements atomiques d'une sélection.

create table if not exists library.placement_selection_move_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  placement_ids uuid[] not null check (cardinality(placement_ids) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, command_id)
);

alter table library.placement_selection_move_receipts enable row level security;
alter table library.placement_selection_move_receipts force row level security;
drop policy if exists own_placement_selection_move_receipts on library.placement_selection_move_receipts;
create policy own_placement_selection_move_receipts on library.placement_selection_move_receipts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on library.placement_selection_move_receipts to authenticated;
revoke insert on library.placement_selection_move_receipts from authenticated;

create or replace function library.record_placement_selection_move_receipt(
  p_user_id uuid, p_command_id uuid, p_request_sha256 text, p_placement_ids uuid[], p_created_at timestamptz
)
returns void language sql security definer set search_path = library, public as $$
  insert into library.placement_selection_move_receipts (user_id, command_id, request_sha256, placement_ids, created_at)
  values (p_user_id, p_command_id, p_request_sha256, p_placement_ids, p_created_at);
$$;

revoke all on function library.record_placement_selection_move_receipt(uuid, uuid, text, uuid[], timestamptz) from public, anon;
grant execute on function library.record_placement_selection_move_receipt(uuid, uuid, text, uuid[], timestamptz) to authenticated;
