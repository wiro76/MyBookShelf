-- Story 2.3 — garde transactionnelle des invariants du rangement réel.

create or replace function library.validate_placement_invariants()
returns trigger
language plpgsql
set search_path = library, public
as $$
declare
  shelf_record record;
  occupied integer;
begin
  select shelves.id, shelves.module_id, shelves.user_id, shelves.capacity_units, modules.status as module_status
    into shelf_record
    from library.shelves shelves
    join library.modules modules on modules.id = shelves.module_id and modules.user_id = shelves.user_id
    where shelves.id = new.shelf_id and shelves.user_id = new.user_id
    for update;
  if not found or shelf_record.module_id <> new.module_id or shelf_record.module_status <> new.status then
    raise exception 'placement_scope_incoherent' using errcode = '23514';
  end if;
  select coalesce(sum(width_units), 0)::integer into occupied
    from library.placements
    where shelf_id = new.shelf_id and id <> coalesce(new.id, gen_random_uuid());
  if occupied + new.width_units > shelf_record.capacity_units or new.item_position <> occupied then
    raise exception 'placement_capacity_or_position_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists library_placements_validate_invariants on library.placements;
create trigger library_placements_validate_invariants
before insert or update on library.placements
for each row execute function library.validate_placement_invariants();

alter table library.placement_receipts
  add constraint placement_receipts_placement_owner_fk
  foreign key (placement_id, user_id) references library.placements (id, user_id);

create or replace function library.record_placement_receipt(
  p_user_id uuid,
  p_command_id uuid,
  p_request_sha256 text,
  p_placement_id uuid,
  p_result_revision bigint,
  p_created_at timestamptz
)
returns void
language sql
security definer
set search_path = library, public
as $$
  insert into library.placement_receipts (user_id, command_id, request_sha256, placement_id, result_revision, created_at)
  values (p_user_id, p_command_id, p_request_sha256, p_placement_id, p_result_revision, p_created_at);
$$;

revoke all on function library.record_placement_receipt(uuid, uuid, text, uuid, bigint, timestamptz) from public, anon;
grant execute on function library.record_placement_receipt(uuid, uuid, text, uuid, bigint, timestamptz) to authenticated;
revoke insert on library.placement_receipts from authenticated;
