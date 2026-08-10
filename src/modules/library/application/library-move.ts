import { createHash } from "node:crypto";
import type { LibraryShelf } from "../domain/library-foundation";
import { planPlacementMove, type MovePlacementInput, type PlacementMovePlan } from "../domain/library-move";

export type LibraryPlacementMoveReceipt = Readonly<{
  commandId: string;
  commandType: "library.placement.move";
  status: "confirmed" | "replayed";
  placementId: string;
  confirmedAt: string;
}>;

export interface LibraryMoveRepository {
  move(userId: string, commandId: string, input: MovePlacementInput): Promise<LibraryPlacementMoveReceipt>;
}

export const placementMoveRequestDigest = (commandId: string, userId: string, input: MovePlacementInput) =>
  createHash("sha256").update(JSON.stringify({ commandId, userId, placementId: input.placementId, destinationShelfId: input.destinationShelfId, destinationPosition: input.destinationPosition, expectedVersion: input.expectedVersion })).digest("hex");

export const buildPlacementMovePlan = (source: LibraryShelf, destination: LibraryShelf, input: MovePlacementInput): PlacementMovePlan => planPlacementMove(source, destination, input);
