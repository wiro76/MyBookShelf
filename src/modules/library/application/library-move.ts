import { createHash } from "node:crypto";
import type { LibraryShelf } from "../domain/library-foundation";
import { planPlacementMove, type MovePlacementInput, type MoveSelectionInput, type PlacementMovePlan } from "../domain/library-move";

export type LibraryPlacementMoveReceipt = Readonly<{
  commandId: string;
  commandType: "library.placement.move";
  status: "confirmed" | "replayed";
  placementId: string;
  confirmedAt: string;
}>;

export type LibrarySelectionMoveReceipt = Readonly<{
  commandId: string;
  commandType: "library.placement.selection-move";
  status: "confirmed" | "replayed";
  placementIds: readonly string[];
  confirmedAt: string;
}>;

export type LibrarySelectionUndoReceipt = Readonly<{
  commandId: string;
  commandType: "library.placement.selection-undo";
  status: "confirmed" | "replayed";
  placementIds: readonly string[];
  confirmedAt: string;
}>;

export interface LibraryMoveRepository {
  move(userId: string, commandId: string, input: MovePlacementInput): Promise<LibraryPlacementMoveReceipt>;
  moveSelection(userId: string, commandId: string, input: MoveSelectionInput): Promise<LibrarySelectionMoveReceipt>;
  undoSelection(userId: string, undoCommandId: string, originalCommandId: string): Promise<LibrarySelectionUndoReceipt>;
}

export const placementMoveRequestDigest = (commandId: string, userId: string, input: MovePlacementInput) =>
  createHash("sha256").update(JSON.stringify({ commandId, userId, placementId: input.placementId, destinationShelfId: input.destinationShelfId, destinationPosition: input.destinationPosition, expectedVersion: input.expectedVersion })).digest("hex");

export const selectionMoveRequestDigest = (commandId: string, userId: string, input: MoveSelectionInput) =>
  createHash("sha256").update(JSON.stringify({ commandId, userId, placementIds: [...input.placementIds].sort(), destinationShelfId: input.destinationShelfId, destinationPosition: input.destinationPosition, expectedVersions: input.expectedVersions })).digest("hex");

export const buildPlacementMovePlan = (source: LibraryShelf, destination: LibraryShelf, input: MovePlacementInput): PlacementMovePlan => planPlacementMove(source, destination, input);
