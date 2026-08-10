import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;

export interface CopyCoverRepository {
  setPreferredCover(userId: string, copyId: string, assetId: string): Promise<void>;
}

export function createPostgresCopyCoverRepository(transaction: Transaction = authenticatedTransaction): CopyCoverRepository {
  return {
    setPreferredCover(userId, copyId, assetId) {
      return transaction(userId, async (client) => {
        await client.query("select library.set_copy_preferred_cover($1, $2, $3)", [userId, copyId, assetId]);
      });
    },
  };
}
