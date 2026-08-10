import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import type { CoverVariantRecord, CoverVariantRepository } from "../application/resolve-cover-url";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;

export function createPostgresCoverVariantRepository(
  transaction: Transaction = authenticatedTransaction,
): CoverVariantRepository {
  return {
    findVariant(userId, assetId) {
      return transaction(userId, async (client) => {
        const result = await client.query<CoverVariantRecord>(`
          select assets.id as "assetId", assets.user_id as "userId", assets.state,
            variants.variant_kind as "variantKind", variants.object_key as "objectKey"
          from media.media_assets assets
          join media.media_variants variants on variants.asset_id = assets.id
          where assets.id = $1 and assets.user_id = $2 and variants.variant_kind = 'private-webp'
          limit 1
        `, [assetId, userId]);
        return result.rows[0] ?? null;
      });
    },
  };
}
