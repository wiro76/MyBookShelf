-- Story 4.2 — conservation de l'état précédent pour une annulation contrôlée.

alter table library.placement_selection_move_receipts
  add column if not exists previous_assignments jsonb not null default '[]'::jsonb,
  add column if not exists undone_at timestamptz,
  add column if not exists undo_command_id uuid;

create unique index if not exists placement_selection_move_undo_command_key
  on library.placement_selection_move_receipts (user_id, undo_command_id)
  where undo_command_id is not null;

create or replace function library.record_placement_selection_move_receipt(
  p_user_id uuid, p_command_id uuid, p_request_sha256 text, p_placement_ids uuid[], p_created_at timestamptz, p_previous_assignments jsonb
)
returns void language sql security definer set search_path = library, public as $$
  insert into library.placement_selection_move_receipts (user_id, command_id, request_sha256, placement_ids, created_at, previous_assignments)
  values (p_user_id, p_command_id, p_request_sha256, p_placement_ids, p_created_at, p_previous_assignments);
$$;

revoke all on function library.record_placement_selection_move_receipt(uuid, uuid, text, uuid[], timestamptz, jsonb) from public, anon;
grant execute on function library.record_placement_selection_move_receipt(uuid, uuid, text, uuid[], timestamptz, jsonb) to authenticated;

-- L'annulation met à jour uniquement le reçu appartenant à l'appelant ; la policy RLS
-- conserve l'isolation par user_id.
grant update on library.placement_selection_move_receipts to authenticated;
