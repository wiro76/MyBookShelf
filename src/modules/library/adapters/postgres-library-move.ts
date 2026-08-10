import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import { LibraryMoveError, planPlacementMove, planPlacementSelectionMove, validateMovePlacementInput, validateMoveSelectionInput } from "../domain/library-move";
import { placementMoveRequestDigest, selectionMoveRequestDigest, type LibraryMoveRepository } from "../application/library-move";
import type { LibraryItem, LibraryShelf } from "../domain/library-foundation";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso = (value: Date | string) => new Date(value).toISOString();

type PlacementRow = { id: string; shelf_id: string; module_id: string; status: LibraryShelf["status"]; item_position: number; width_units: number; version: string | number };
type ShelfRow = { id: string; module_id: string; status: LibraryShelf["status"]; capacity_units: number };

const toShelf = (row: ShelfRow, rows: PlacementRow[]): LibraryShelf => ({
  id: row.id, moduleId: row.module_id, status: row.status, shelfPosition: 0, capacityUnits: row.capacity_units,
  occupiedUnits: rows.reduce((total, item) => total + item.width_units, 0),
  items: rows.map((item): LibraryItem => ({ id: item.id, copyId: item.id, title: "", author: null, editionTitle: "", itemPosition: item.item_position, widthUnits: item.width_units, version: Number(item.version), coverStatus: "not-provided" })),
});

export function createPostgresLibraryMoveRepository(transaction: Transaction = authenticatedTransaction): LibraryMoveRepository {
  return {
    move(userId, commandId, inputValue) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryMoveError());
      const input = validateMovePlacementInput(inputValue);
      const digest = placementMoveRequestDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':placement-move', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; placement_id: string; created_at: Date | string }>("select request_sha256, placement_id, created_at from library.placement_move_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== digest) throw new LibraryMoveError("LIBRARY_MOVE_COMMAND_REUSED");
          return { commandId, commandType: "library.placement.move", status: "replayed", placementId: replay.rows[0].placement_id, confirmedAt: iso(replay.rows[0].created_at) };
        }
        const sourceResult = await client.query<PlacementRow>("select id, shelf_id, module_id, status, item_position, width_units, version from library.placements where id = $1 and user_id = $2 for update", [input.placementId, userId]);
        const sourceRow = sourceResult.rows[0];
        if (!sourceRow) throw new LibraryMoveError("LIBRARY_MOVE_PLACEMENT_MISSING");
        if (Number(sourceRow.version) !== input.expectedVersion) throw new LibraryMoveError("LIBRARY_MOVE_VERSION_CONFLICT");
        const destinationResult = await client.query<ShelfRow>("select shelves.id, shelves.module_id, modules.status, shelves.capacity_units from library.shelves shelves join library.modules modules on modules.id = shelves.module_id and modules.user_id = shelves.user_id where shelves.id = $1 and shelves.user_id = $2 for update of shelves, modules", [input.destinationShelfId, userId]);
        const destinationRow = destinationResult.rows[0];
        if (!destinationRow) throw new LibraryMoveError("LIBRARY_MOVE_DESTINATION_MISSING");
        const shelfIds = sourceRow.shelf_id === destinationRow.id ? [sourceRow.shelf_id] : [sourceRow.shelf_id, destinationRow.id].sort();
        const placements = await client.query<PlacementRow>("select id, shelf_id, module_id, status, item_position, width_units, version from library.placements where user_id = $1 and shelf_id = any($2::uuid[]) order by shelf_id, item_position for update", [userId, shelfIds]);
        const sourceItems = placements.rows.filter((row) => row.shelf_id === sourceRow.shelf_id);
        const destinationItems = placements.rows.filter((row) => row.shelf_id === destinationRow.id);
        const sourceShelf = toShelf({ id: sourceRow.shelf_id, module_id: sourceRow.module_id, status: sourceRow.status, capacity_units: sourceRow.shelf_id === destinationRow.id ? destinationRow.capacity_units : (await client.query<{ capacity_units: number }>("select capacity_units from library.shelves where id = $1", [sourceRow.shelf_id])).rows[0].capacity_units }, sourceItems);
        const plan = planPlacementMove(sourceShelf, toShelf(destinationRow, destinationItems), input);
        await client.query("set constraints placements_shelf_item_position_unique deferred");
        for (const assignment of plan.assignments) {
          await client.query("update library.placements set shelf_id = $1, module_id = $2, status = $3, item_position = $4, version = version + 1 where id = $5 and user_id = $6", [assignment.shelfId, assignment.moduleId, assignment.status, assignment.itemPosition, assignment.placementId, userId]);
        }
        const moved = await client.query<{ version: string | number; updated_at: Date | string }>("update library.placements set version = version where id = $1 returning version, coalesce(created_at, now()) as updated_at", [input.placementId]);
        const result = moved.rows[0];
        await client.query("select library.record_placement_move_receipt($1, $2, $3, $4, $5, $6)", [userId, commandId, digest, input.placementId, Number(result.version), result.updated_at]);
        return { commandId, commandType: "library.placement.move", status: "confirmed", placementId: input.placementId, confirmedAt: iso(result.updated_at) };
      });
    },
    moveSelection(userId, commandId, inputValue) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryMoveError());
      const input = validateMoveSelectionInput(inputValue);
      if (input.placementIds.some((id) => !UUID.test(id))) return Promise.reject(new LibraryMoveError());
      const placementIds = [...input.placementIds].sort();
      const digest = selectionMoveRequestDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':placement-selection-move', 0))", [userId]);
        const replay = await client.query<{ request_sha256: string; placement_ids: string[]; created_at: Date | string }>("select request_sha256, placement_ids, created_at from library.placement_selection_move_receipts where user_id = $1 and command_id = $2", [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== digest) throw new LibraryMoveError("LIBRARY_MOVE_COMMAND_REUSED");
          return { commandId, commandType: "library.placement.selection-move", status: "replayed", placementIds: replay.rows[0].placement_ids, confirmedAt: iso(replay.rows[0].created_at) };
        }
        const selectedResult = await client.query<PlacementRow>("select id, shelf_id, module_id, status, item_position, width_units, version from library.placements where user_id = $1 and id = any($2::uuid[]) order by id for update", [userId, placementIds]);
        if (selectedResult.rows.length !== placementIds.length) throw new LibraryMoveError("LIBRARY_MOVE_PLACEMENT_MISSING");
        for (const row of selectedResult.rows) if (Number(row.version) !== input.expectedVersions[row.id]) throw new LibraryMoveError("LIBRARY_MOVE_VERSION_CONFLICT");
        const destinationResult = await client.query<ShelfRow>("select shelves.id, shelves.module_id, modules.status, shelves.capacity_units from library.shelves shelves join library.modules modules on modules.id = shelves.module_id and modules.user_id = shelves.user_id where shelves.id = $1 and shelves.user_id = $2 for update of shelves, modules", [input.destinationShelfId, userId]);
        const destinationRow = destinationResult.rows[0];
        if (!destinationRow) throw new LibraryMoveError("LIBRARY_MOVE_DESTINATION_MISSING");
        const sourceShelfIds = [...new Set(selectedResult.rows.map((row) => row.shelf_id))];
        const shelfIds = [...new Set([...sourceShelfIds, destinationRow.id])].sort();
        const shelfResult = await client.query<ShelfRow>("select shelves.id, shelves.module_id, modules.status, shelves.capacity_units from library.shelves shelves join library.modules modules on modules.id = shelves.module_id and modules.user_id = shelves.user_id where shelves.user_id = $1 and shelves.id = any($2::uuid[]) order by shelves.id for update of shelves, modules", [userId, shelfIds]);
        const placements = await client.query<PlacementRow>("select id, shelf_id, module_id, status, item_position, width_units, version from library.placements where user_id = $1 and shelf_id = any($2::uuid[]) order by shelf_id, item_position for update", [userId, shelfIds]);
        const shelves = shelfResult.rows.map((row) => toShelf(row, placements.rows.filter((item) => item.shelf_id === row.id)));
        const destinationShelf = shelves.find((shelf) => shelf.id === destinationRow.id);
        if (!destinationShelf) throw new LibraryMoveError("LIBRARY_MOVE_DESTINATION_MISSING");
        const plan = planPlacementSelectionMove(shelves, destinationShelf, input);
        await client.query("set constraints placements_shelf_item_position_unique deferred");
        for (const assignment of plan.assignments) await client.query("update library.placements set shelf_id = $1, module_id = $2, status = $3, item_position = $4, version = version + 1 where id = $5 and user_id = $6", [assignment.shelfId, assignment.moduleId, assignment.status, assignment.itemPosition, assignment.placementId, userId]);
        const now = await client.query<{ at: Date | string }>("select now() as at");
        await client.query("select library.record_placement_selection_move_receipt($1, $2, $3, $4::uuid[], $5)", [userId, commandId, digest, placementIds, now.rows[0].at]);
        return { commandId, commandType: "library.placement.selection-move", status: "confirmed", placementIds, confirmedAt: iso(now.rows[0].at) };
      });
    },
  };
}
