import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import {
  DEFAULT_SHELF_CAPACITY_UNITS,
  DEFAULT_SHELF_COUNT,
  LibraryFoundationError,
  type LibraryProjection,
} from "../domain/library-foundation";
import type { LibraryStatus } from "../domain/library-view-state";
import { FOUNDATION_STATUSES, placementRequestDigest, type LibraryFoundationRepository } from "../application/library-foundation";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ensureStatus = async (client: PoolClient, userId: string, status: LibraryStatus) => {
  await client.query(`
    insert into library.modules (user_id, status, module_position, shelf_count, capacity_units)
    values ($1, $2, 0, $3, $4)
    on conflict (user_id, status, module_position) do nothing
  `, [userId, status, DEFAULT_SHELF_COUNT, DEFAULT_SHELF_CAPACITY_UNITS]);
  await client.query(`
    insert into library.shelves (user_id, module_id, shelf_position, capacity_units)
    select $1, modules.id, positions.position, modules.capacity_units
    from library.modules modules
    cross join generate_series(0, modules.shelf_count - 1) as positions(position)
    where modules.user_id = $1 and modules.status = $2 and modules.module_position = 0
    on conflict (module_id, shelf_position) do nothing
  `, [userId, status]);
};

const safeDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new LibraryFoundationError("LIBRARY_FOUNDATION_INVALID");
  return date.toISOString();
};

export function createPostgresLibraryFoundationRepository(transaction: Transaction = authenticatedTransaction): LibraryFoundationRepository {
  return {
    ensure(userId) {
      if (!UUID.test(userId)) return Promise.reject(new LibraryFoundationError());
      return transaction(userId, async (client) => {
        for (const status of FOUNDATION_STATUSES) await ensureStatus(client, userId, status);
      });
    },

    load(userId) {
      if (!UUID.test(userId)) return Promise.reject(new LibraryFoundationError());
      return transaction(userId, async (client) => {
        const result = await client.query<{
          module_id: string;
          status: LibraryStatus;
          module_position: number;
          capacity_units: number;
          shelf_id: string;
          shelf_position: number;
          shelf_capacity_units: number;
          occupied_units: number;
        }>(`
          select modules.id as module_id, modules.status, modules.module_position, modules.capacity_units,
            shelves.id as shelf_id, shelves.shelf_position, shelves.capacity_units as shelf_capacity_units,
            coalesce(sum(placements.width_units), 0)::int as occupied_units
          from library.modules modules
          join library.shelves shelves on shelves.module_id = modules.id and shelves.user_id = modules.user_id
          left join library.placements placements on placements.shelf_id = shelves.id and placements.user_id = modules.user_id
          where modules.user_id = $1
          group by modules.id, modules.status, modules.module_position, modules.capacity_units,
            shelves.id, shelves.shelf_position, shelves.capacity_units
          order by modules.status, modules.module_position, shelves.shelf_position
        `, [userId]);
        const byStatus = new Map<LibraryStatus, { status: LibraryStatus; modules: Array<{ id: string; status: LibraryStatus; modulePosition: number; capacityUnits: number; shelves: Array<{ id: string; moduleId: string; status: LibraryStatus; shelfPosition: number; capacityUnits: number; occupiedUnits: number }> }> }>();
        for (const status of FOUNDATION_STATUSES) byStatus.set(status, { status, modules: [] });
        for (const row of result.rows) {
          const entry = byStatus.get(row.status);
          if (!entry) throw new LibraryFoundationError();
          let moduleRow = entry.modules.at(-1);
          if (!moduleRow || moduleRow.id !== row.module_id) {
            moduleRow = { id: row.module_id, status: row.status, modulePosition: row.module_position, capacityUnits: row.capacity_units, shelves: [] };
            entry.modules.push(moduleRow);
          }
          moduleRow.shelves.push({ id: row.shelf_id, moduleId: row.module_id, status: row.status, shelfPosition: row.shelf_position, capacityUnits: row.shelf_capacity_units, occupiedUnits: row.occupied_units });
        }
        return { statuses: FOUNDATION_STATUSES.map((status) => byStatus.get(status)!) } satisfies LibraryProjection;
      });
    },

    appendPlacement(userId, commandId, input) {
      if (!UUID.test(userId) || !UUID.test(commandId) || !UUID.test(input.copyId)) return Promise.reject(new LibraryFoundationError());
      const digest = placementRequestDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        const replay = await client.query<{ request_sha256: string; placement_id: string; created_at: Date | string }>(`
          select request_sha256, placement_id, created_at from library.placement_receipts where user_id = $1 and command_id = $2
        `, [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== digest) throw new LibraryFoundationError("LIBRARY_FOUNDATION_COMMAND_REUSED");
          return { commandId, commandType: "library.placement.append", status: "replayed", placementId: replay.rows[0].placement_id!, confirmedAt: safeDate(replay.rows[0].created_at) };
        }
        const copy = await client.query<{ id: string }>("select id from library.copies where id = $1 and user_id = $2 for update", [input.copyId, userId]);
        if (!copy.rows[0]) throw new LibraryFoundationError("LIBRARY_FOUNDATION_COPY_MISSING");
        const existing = await client.query("select 1 from library.placements where copy_id = $1", [input.copyId]);
        if (existing.rows[0]) throw new LibraryFoundationError("LIBRARY_FOUNDATION_COPY_ALREADY_PLACED");
        await ensureStatus(client, userId, input.status);
        const target = await client.query<{ module_id: string; shelf_id: string; module_position: number; shelf_position: number; item_position: number }>(`
          with shelves as (
            select modules.id as module_id, shelves.id as shelf_id, modules.module_position, shelves.shelf_position,
              coalesce(sum(placements.width_units), 0)::int as occupied_units, shelves.capacity_units
            from library.modules modules join library.shelves shelves on shelves.module_id = modules.id and shelves.user_id = modules.user_id
            left join library.placements placements on placements.shelf_id = shelves.id and placements.user_id = modules.user_id
            where modules.user_id = $1 and modules.status = $2
            group by modules.id, shelves.id, modules.module_position, shelves.shelf_position, shelves.capacity_units
          )
          select module_id, shelf_id, module_position, shelf_position, occupied_units as item_position
          from shelves where occupied_units + $3 <= capacity_units
          order by module_position desc, shelf_position desc limit 1
          for update
        `, [userId, input.status, input.widthUnits]);
        let destination = target.rows[0];
        if (!destination) {
          const nextModule = await client.query<{ id: string; module_position: number }>(`
            insert into library.modules (user_id, status, module_position, shelf_count, capacity_units)
            select $1, $2, coalesce(max(module_position), -1) + 1, $3, $4
            from library.modules where user_id = $1 and status = $2
            returning id, module_position
          `, [userId, input.status, DEFAULT_SHELF_COUNT, DEFAULT_SHELF_CAPACITY_UNITS]);
          const nextModuleRow = nextModule.rows[0];
          await client.query(`insert into library.shelves (user_id, module_id, shelf_position, capacity_units) select $1, $2, generate_series(0, $3 - 1), $4`, [userId, nextModuleRow.id, DEFAULT_SHELF_COUNT, DEFAULT_SHELF_CAPACITY_UNITS]);
          const shelf = await client.query<{ id: string }>("select id from library.shelves where user_id = $1 and module_id = $2 and shelf_position = 0", [userId, nextModuleRow.id]);
          destination = { module_id: nextModuleRow.id, shelf_id: shelf.rows[0].id, module_position: nextModuleRow.module_position, shelf_position: 0, item_position: 0 };
        }
        const placement = await client.query<{ id: string; version: string | number; created_at: Date | string }>(`
          insert into library.placements (user_id, status, shelf_id, module_id, copy_id, item_position, width_units)
          values ($1, $2, $3, $4, $5, $6, $7) returning id, version, created_at
        `, [userId, input.status, destination.shelf_id, destination.module_id, input.copyId, destination.item_position, input.widthUnits]);
        const row = placement.rows[0];
        await client.query(`insert into library.placement_receipts (user_id, command_id, request_sha256, placement_id, result_revision, created_at) values ($1, $2, $3, $4, $5, $6)`, [userId, commandId, digest, row.id, Number(row.version), row.created_at]);
        return { commandId, commandType: "library.placement.append", status: "confirmed", placementId: row.id, confirmedAt: safeDate(row.created_at) };
      });
    },
  };
}
