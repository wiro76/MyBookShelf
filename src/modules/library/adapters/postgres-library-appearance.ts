import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import { appearanceRequestDigest } from "../domain/library-appearance";
import type { LibraryAppearanceRepository, StoredAppearancePreference } from "../application/library-appearance";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;

function mapRow(row: { structure_id: string; finish_id: string; version: string | number; updated_at: Date | string }): StoredAppearancePreference {
  return { structureId: row.structure_id, finishId: row.finish_id, version: Number(row.version), updatedAt: new Date(row.updated_at).toISOString() };
}

export function createPostgresLibraryAppearanceRepository(transaction: Transaction = authenticatedTransaction): LibraryAppearanceRepository {
  return {
    load(userId) {
      return transaction(userId, async (client) => {
        const result = await client.query<{ structure_id: string; finish_id: string; version: string | number; updated_at: Date | string }>(
          "select structure_id, finish_id, version, updated_at from library.appearance_preferences where user_id = $1",
          [userId],
        );
        return result.rows[0] ? mapRow(result.rows[0]) : null;
      });
    },
    save(userId, preference, requestId) {
      const digest = appearanceRequestDigest(`${userId}:${requestId}`, preference);
      return transaction(userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':appearance', 0))", [userId]);
        const existing = await client.query<{ command_id: string; request_sha256: string; structure_id: string; finish_id: string; version: string | number; updated_at: Date | string }>(
          "select command_id, request_sha256, structure_id, finish_id, version, updated_at from library.appearance_preferences where user_id = $1",
          [userId],
        );
        if (existing.rows[0]?.command_id === requestId) {
          if (existing.rows[0].request_sha256 !== digest) throw new Error("LIBRARY_APPEARANCE_COMMAND_REUSED");
          return mapRow(existing.rows[0]);
        }
        const result = await client.query<{ structure_id: string; finish_id: string; version: string | number; updated_at: Date | string }>(
          `insert into library.appearance_preferences (user_id, command_id, structure_id, finish_id, request_sha256)
           values ($1, $2, $3, $4, $5)
           on conflict (user_id) do update set command_id = excluded.command_id, structure_id = excluded.structure_id, finish_id = excluded.finish_id,
             request_sha256 = excluded.request_sha256, version = library.appearance_preferences.version + 1, updated_at = now()
           returning structure_id, finish_id, version, updated_at`,
          [userId, requestId, preference.structureId, preference.finishId, digest],
        );
        return mapRow(result.rows[0]);
      });
    },
  };
}
