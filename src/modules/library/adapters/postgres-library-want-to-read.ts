import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import { DEFAULT_SHELF_CAPACITY_UNITS, DEFAULT_SHELF_COUNT } from "../domain/library-foundation";
import { LibraryWantToReadError, validateAddEditionAsWantToRead } from "../domain/library-want-to-read";
import { wantToReadRequestDigest, type LibraryWantToReadRepository } from "../application/library-want-to-read";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;

const ensureWantToRead = async (client: PoolClient, userId: string) => {
  await client.query(`insert into library.modules (user_id, status, module_position, shelf_count, capacity_units) values ($1, 'want-to-read', 0, $2, $3) on conflict (user_id, status, module_position) do nothing`, [userId, DEFAULT_SHELF_COUNT, DEFAULT_SHELF_CAPACITY_UNITS]);
  await client.query(`insert into library.shelves (user_id, module_id, shelf_position, capacity_units) select $1, id, generate_series(0, shelf_count - 1), capacity_units from library.modules where user_id = $1 and status = 'want-to-read' and module_position = 0 on conflict (module_id, shelf_position) do nothing`, [userId]);
};

const iso = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new LibraryWantToReadError();
  return date.toISOString();
};

async function append(client: PoolClient, userId: string, copyId: string, widthUnits = 1) {
  await ensureWantToRead(client, userId);
  await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':want-to-read', 0))", [userId]);
  const target = await client.query<{ module_id: string; shelf_id: string; module_position: number; item_position: number }>(`
    with shelves as (
      select modules.id module_id, shelves.id shelf_id, modules.module_position, shelves.shelf_position,
        coalesce(sum(placements.width_units), 0)::int occupied_units, shelves.capacity_units
      from library.modules modules join library.shelves shelves on shelves.module_id = modules.id and shelves.user_id = modules.user_id
      left join library.placements placements on placements.shelf_id = shelves.id and placements.user_id = modules.user_id
      where modules.user_id = $1 and modules.status = 'want-to-read'
      group by modules.id, shelves.id, modules.module_position, shelves.shelf_position, shelves.capacity_units
    )
    select module_id, shelf_id, module_position, occupied_units item_position
    from shelves where occupied_units + $2 <= capacity_units
    order by module_position desc, shelf_position desc limit 1 for update
  `, [userId, widthUnits]);
  let destination = target.rows[0];
  if (!destination) {
    const createdModule = await client.query<{ id: string; module_position: number }>(`insert into library.modules (user_id, status, module_position, shelf_count, capacity_units) select $1, 'want-to-read', coalesce(max(module_position), -1) + 1, $2, $3 from library.modules where user_id = $1 and status = 'want-to-read' returning id, module_position`, [userId, DEFAULT_SHELF_COUNT, DEFAULT_SHELF_CAPACITY_UNITS]);
    const row = createdModule.rows[0];
    await client.query(`insert into library.shelves (user_id, module_id, shelf_position, capacity_units) select $1, $2, generate_series(0, $3 - 1), $4`, [userId, row.id, DEFAULT_SHELF_COUNT, DEFAULT_SHELF_CAPACITY_UNITS]);
    const shelf = await client.query<{ id: string }>(`select id from library.shelves where user_id = $1 and module_id = $2 and shelf_position = 0`, [userId, row.id]);
    destination = { module_id: row.id, shelf_id: shelf.rows[0].id, module_position: row.module_position, item_position: 0 };
  }
  const placement = await client.query<{ id: string; version: string | number; created_at: Date | string }>(`insert into library.placements (user_id, status, shelf_id, module_id, copy_id, item_position, width_units) values ($1, 'want-to-read', $2, $3, $4, $5, $6) returning id, version, created_at`, [userId, destination.shelf_id, destination.module_id, copyId, destination.item_position, widthUnits]);
  return placement.rows[0];
}

export function createPostgresLibraryWantToReadRepository(transaction: Transaction = authenticatedTransaction): LibraryWantToReadRepository {
  return {
    addEditionAsWantToRead(userId, commandId, rawInput) {
      if (!UUID.test(userId) || !UUID.test(commandId)) return Promise.reject(new LibraryWantToReadError());
      const input = validateAddEditionAsWantToRead(rawInput);
      const digest = wantToReadRequestDigest(commandId, userId, input);
      return transaction(userId, async (client) => {
        const replay = await client.query<{ request_sha256: string; copy_id: string; placement_id: string; created_at: Date | string }>(`select request_sha256, copy_id, placement_id, created_at from library.library_add_receipts where user_id = $1 and command_id = $2`, [userId, commandId]);
        if (replay.rows[0]) {
          if (replay.rows[0].request_sha256 !== digest) throw new LibraryWantToReadError("LIBRARY_WANT_TO_READ_COMMAND_REUSED");
          return { commandId, status: "replayed", copyId: replay.rows[0].copy_id, placementId: replay.rows[0].placement_id, confirmedAt: iso(replay.rows[0].created_at) };
        }
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':want-to-read', 0))", [userId]);
        const work = await client.query<{ id: string }>(`insert into library.works (canonical_key, title, provenance) values ($1, $2, $3::jsonb) on conflict (canonical_key) do update set title = excluded.title returning id`, [input.candidateKey, input.workTitle, JSON.stringify(input.provenance)]);
        const edition = await client.query<{ id: string }>(`insert into library.editions (work_id, canonical_key, title, identifiers, provenance) values ($1, $2, $3, $4::jsonb, $5::jsonb) on conflict (work_id, canonical_key) do update set title = excluded.title returning id`, [work.rows[0].id, input.editionKey, input.editionTitle, JSON.stringify(input.identifiers), JSON.stringify(input.provenance)]);
        await client.query(`insert into library.user_works (user_id, work_id, intention) values ($1, $2, 'want-to-read') on conflict (user_id, work_id) do update set intention = 'want-to-read', version = library.user_works.version + 1`, [userId, work.rows[0].id]);
        const copy = await client.query<{ id: string }>(`insert into library.copies (user_id, edition_id) values ($1, $2) returning id`, [userId, edition.rows[0].id]);
        const placement = await append(client, userId, copy.rows[0].id);
        await client.query("select library.record_library_add_receipt($1, $2, $3, $4, $5, $6, $7)", [userId, commandId, digest, copy.rows[0].id, placement.id, Number(placement.version), placement.created_at]);
        return { commandId, status: "confirmed", copyId: copy.rows[0].id, placementId: placement.id, confirmedAt: iso(placement.created_at) };
      });
    },
  };
}
