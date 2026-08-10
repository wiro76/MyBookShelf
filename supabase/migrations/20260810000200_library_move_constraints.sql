-- Story 4.1 — un déplacement peut réordonner plusieurs lignes dans une transaction.

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
  if occupied + new.width_units > shelf_record.capacity_units
     or (tg_op = 'INSERT' and new.item_position <> occupied)
     or (tg_op = 'UPDATE' and new.item_position > shelf_record.capacity_units - new.width_units) then
    raise exception 'placement_capacity_or_position_invalid' using errcode = '23514';
  end if;
  return new;
end;
$$;

alter table library.placements
  drop constraint if exists placements_shelf_id_item_position_key;

alter table library.placements
  add constraint placements_shelf_item_position_unique
  unique (shelf_id, item_position)
  deferrable initially immediate;
