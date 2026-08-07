import { createHash } from "node:crypto";
import type { LibraryProjection, AppendPlacementInput } from "../domain/library-foundation";
import type { LibraryStatus } from "../domain/library-view-state";

export type LibraryPlacementReceipt = Readonly<{
  commandId: string;
  commandType: "library.placement.append";
  status: "confirmed" | "replayed";
  placementId: string;
  confirmedAt: string;
}>;

export interface LibraryFoundationRepository {
  ensure(userId: string): Promise<void>;
  load(userId: string): Promise<LibraryProjection>;
  appendPlacement(userId: string, commandId: string, input: AppendPlacementInput): Promise<LibraryPlacementReceipt>;
}

export const FOUNDATION_STATUSES: readonly LibraryStatus[] = ["want-to-read", "reading", "finished"];

export const placementRequestDigest = (commandId: string, userId: string, input: AppendPlacementInput) =>
  createHash("sha256").update(JSON.stringify({ commandId, userId, status: input.status, copyId: input.copyId, widthUnits: input.widthUnits })).digest("hex");
