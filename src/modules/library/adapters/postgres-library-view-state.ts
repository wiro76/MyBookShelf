import type { PoolClient } from "pg";

import {
  type LibraryViewStateReceipt,
  type LibraryViewStateRepository,
} from "../application/library-view-state";
import {
  LibraryViewStateError,
  validateStoredLibraryViewState,
  type StoredLibraryViewState,
} from "../domain/library-view-state";
import { authenticatedTransaction } from "@/shared/kernel";

type Transaction = <T>(userId: string, work: (client: PoolClient) => Promise<T>) => Promise<T>;

type StateRow = {
  status: string;
  module_id: string | null;
  shelf_id: string | null;
  copy_id: string | null;
  module_position: number | null;
  shelf_position: number | null;
  item_position: number | null;
  revision: string | number;
  confirmed_at: Date | string;
};

type ReceiptRow = {
  request_sha256: string;
  result_revision: string | number;
  created_at: Date | string;
};

const safeRevision = (value: string | number) => {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new LibraryViewStateError();
  return revision;
};

const mapReceipt = (row: ReceiptRow, commandId: string, requestSha256: string): LibraryViewStateReceipt => {
  if (row.request_sha256 !== requestSha256) throw new LibraryViewStateError("LIBRARY_VIEW_STATE_COMMAND_REUSED");
  const revision = safeRevision(row.result_revision);
  const confirmedAt = new Date(row.created_at);
  if (!Number.isFinite(confirmedAt.getTime())) throw new LibraryViewStateError();
  return {
    commandId,
    commandType: "library.view-state.confirm",
    status: "replayed",
    revision,
    confirmedAt: confirmedAt.toISOString(),
  };
};

const mapState = (row: StateRow): StoredLibraryViewState => validateStoredLibraryViewState({
  status: row.status,
  moduleId: row.module_id,
  shelfId: row.shelf_id,
  copyId: row.copy_id,
  modulePosition: row.module_position,
  shelfPosition: row.shelf_position,
  itemPosition: row.item_position,
  revision: safeRevision(row.revision),
  confirmedAt: row.confirmed_at instanceof Date ? row.confirmed_at.toISOString() : new Date(row.confirmed_at).toISOString(),
});

export function createPostgresLibraryViewStateRepository(
  transaction: Transaction = authenticatedTransaction,
): LibraryViewStateRepository {
  return {
    load(userId) {
      return transaction(userId, async (client) => {
        const result = await client.query<StateRow>(`
          select status, module_id, shelf_id, copy_id,
            module_position, shelf_position, item_position, revision, confirmed_at
          from library.library_view_states
          where user_id = $1
        `, [userId]);
        return result.rows[0] ? mapState(result.rows[0]) : null;
      });
    },

    replay(userId, commandId, requestSha256) {
      return transaction(userId, async (client) => {
        const result = await client.query<ReceiptRow>(`
          select request_sha256, result_revision, created_at
          from library.library_view_state_receipts
          where user_id = $1 and command_id = $2
        `, [userId, commandId]);
        return result.rows[0] ? mapReceipt(result.rows[0], commandId, requestSha256) : null;
      });
    },

    confirm(userId, commandId, requestSha256, target, expectedRevision) {
      return transaction(userId, async (client) => {
        const existingReceipt = await client.query<ReceiptRow>(`
          select request_sha256, result_revision, created_at
          from library.library_view_state_receipts
          where user_id = $1 and command_id = $2
        `, [userId, commandId]);
        if (existingReceipt.rows[0]) return mapReceipt(existingReceipt.rows[0], commandId, requestSha256);

        const current = await client.query<{ revision: string | number }>(`
          select revision from library.library_view_states where user_id = $1 for update
        `, [userId]);
        const receiptAfterLock = await client.query<ReceiptRow>(`
          select request_sha256, result_revision, created_at
          from library.library_view_state_receipts
          where user_id = $1 and command_id = $2
        `, [userId, commandId]);
        if (receiptAfterLock.rows[0]) return mapReceipt(receiptAfterLock.rows[0], commandId, requestSha256);
        const currentRevision = current.rows[0] ? safeRevision(current.rows[0].revision) : 0;
        if (currentRevision !== expectedRevision) throw new LibraryViewStateError("LIBRARY_VIEW_STATE_CONFLICT");
        const nextRevision = expectedRevision + 1;
        const confirmed = await client.query<{ revision: string | number; confirmed_at: Date | string }>(`
          insert into library.library_view_states (
            user_id, status, module_id, shelf_id, copy_id,
            module_position, shelf_position, item_position, revision, confirmed_at
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
          on conflict (user_id) do update set
            status = excluded.status,
            module_id = excluded.module_id,
            shelf_id = excluded.shelf_id,
            copy_id = excluded.copy_id,
            module_position = excluded.module_position,
            shelf_position = excluded.shelf_position,
            item_position = excluded.item_position,
            revision = excluded.revision,
            confirmed_at = excluded.confirmed_at
          where library.library_view_states.revision = $10
          returning revision, confirmed_at
        `, [
          userId, target.status, target.moduleId, target.shelfId, target.copyId,
          target.modulePosition, target.shelfPosition, target.itemPosition, nextRevision, expectedRevision,
        ]);
        if (!confirmed.rows[0]) {
          const racedReceipt = await client.query<ReceiptRow>(`
            select request_sha256, result_revision, created_at
            from library.library_view_state_receipts
            where user_id = $1 and command_id = $2
          `, [userId, commandId]);
          if (racedReceipt.rows[0]) return mapReceipt(racedReceipt.rows[0], commandId, requestSha256);
          throw new LibraryViewStateError("LIBRARY_VIEW_STATE_CONFLICT");
        }

        const confirmedAt = new Date(confirmed.rows[0].confirmed_at).toISOString();
        await client.query(`
          insert into library.library_view_state_receipts (
            user_id, command_id, request_sha256, result_revision, created_at
          ) values ($1, $2, $3, $4, $5)
        `, [userId, commandId, requestSha256, nextRevision, confirmedAt]);
        return {
          commandId,
          commandType: "library.view-state.confirm",
          status: "confirmed",
          revision: nextRevision,
          confirmedAt,
        };
      });
    },
  };
}
