import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import type { PersonalCoverRepository } from "../application/store-personal-cover";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;

export function createPostgresPersonalCoverRepository(transaction: Transaction = authenticatedTransaction): PersonalCoverRepository {
  return {
    savePrepared(input) {
      return transaction(input.userId, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1 || ':media-cover', 0))", [input.userId]);
        await client.query(`
          insert into media.media_assets
            (id, user_id, media_type, state, original_sha256, original_bytes, width, height, original_object_key, provenance)
          values ($1, $2, 'cover', 'quarantined', $3, $4, $5, $6, $7, $8::jsonb)
          on conflict (id) do nothing
        `, [input.prepared.assetId, input.userId, input.prepared.originalSha256, input.prepared.originalBytes, input.prepared.width, input.prepared.height, input.originalObjectKey, JSON.stringify(input.prepared.provenance)]);
        await client.query(`
          insert into media.media_variants (asset_id, variant_kind, sha256, object_key, mime_type, width, height)
          values ($1, 'private-webp', $2, $3, 'image/webp', $4, $5)
          on conflict (asset_id, variant_kind) do nothing
        `, [input.prepared.assetId, input.prepared.variant.sha256, input.variantObjectKey, input.prepared.variant.width, input.prepared.variant.height]);
        const state = await client.query<{ state: string }>("select state from media.media_assets where id = $1 and user_id = $2", [input.prepared.assetId, input.userId]);
        if (state.rows[0]?.state === "quarantined") await client.query("select media.transition_asset_state($1, $2, 'private')", [input.userId, input.prepared.assetId]);
        await client.query("select media.record_personal_cover_receipt($1, $2, $3, $4, now())", [input.userId, input.commandId, input.requestSha256, input.prepared.assetId]);
      });
    },
  };
}
