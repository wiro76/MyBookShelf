import type { LibraryItem, LibraryShelf } from "./library-foundation";

export type MovePlacementInput = Readonly<{
  placementId: string;
  destinationShelfId: string;
  destinationPosition: number;
  expectedVersion: number;
}>;

export type MoveSelectionInput = Readonly<{
  placementIds: readonly string[];
  destinationShelfId: string;
  destinationPosition: number;
  expectedVersions: Readonly<Record<string, number>>;
}>;

export type PlacementAssignment = Readonly<{
  placementId: string;
  shelfId: string;
  moduleId: string;
  status: LibraryShelf["status"];
  itemPosition: number;
}>;

export type PlacementMovePlan = Readonly<{
  sourceShelfId: string;
  destinationShelfId: string;
  assignments: readonly PlacementAssignment[];
}>;

export type SelectionMovePlan = Readonly<{
  destinationShelfId: string;
  sourceShelfIds: readonly string[];
  assignments: readonly PlacementAssignment[];
}>;

export class LibraryMoveError extends Error {
  readonly code: string;

  constructor(code = "LIBRARY_MOVE_INVALID") {
    super(code);
    this.name = "LibraryMoveError";
    this.code = code;
  }
}

const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isVersion = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function validateMovePlacementInput(value: unknown): MovePlacementInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryMoveError();
  const input = value as Record<string, unknown>;
  if (typeof input.placementId !== "string" || !input.placementId
      || typeof input.destinationShelfId !== "string" || !input.destinationShelfId
      || !isIndex(input.destinationPosition) || !isVersion(input.expectedVersion)) throw new LibraryMoveError();
  return {
    placementId: input.placementId,
    destinationShelfId: input.destinationShelfId,
    destinationPosition: input.destinationPosition,
    expectedVersion: input.expectedVersion,
  };
}

export function validateMoveSelectionInput(value: unknown): MoveSelectionInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryMoveError();
  const input = value as Record<string, unknown>;
  const placementIds = input.placementIds;
  const versions = input.expectedVersions;
  if (!Array.isArray(placementIds) || placementIds.length < 1 || placementIds.length > 100 || placementIds.some((id) => typeof id !== "string" || !id) || new Set(placementIds).size !== placementIds.length
      || typeof input.destinationShelfId !== "string" || !input.destinationShelfId || !isIndex(input.destinationPosition)
      || !versions || typeof versions !== "object" || Array.isArray(versions)) throw new LibraryMoveError();
  const expectedVersions: Record<string, number> = {};
  for (const id of placementIds) {
    const version = (versions as Record<string, unknown>)[id];
    if (!isVersion(version)) throw new LibraryMoveError("LIBRARY_MOVE_VERSION_CONFLICT");
    expectedVersions[id] = version;
  }
  return { placementIds: [...placementIds], destinationShelfId: input.destinationShelfId, destinationPosition: input.destinationPosition, expectedVersions };
}

const orderedItems = (items: readonly LibraryItem[]) => [...items].sort((left, right) => left.itemPosition - right.itemPosition || left.id.localeCompare(right.id));

export function planPlacementMove(source: LibraryShelf, destination: LibraryShelf, inputValue: unknown): PlacementMovePlan {
  const input = validateMovePlacementInput(inputValue);
  const sourceItem = source.items.find((item) => item.id === input.placementId);
  if (!sourceItem) throw new LibraryMoveError("LIBRARY_MOVE_PLACEMENT_MISSING");
  if (destination.id !== input.destinationShelfId) throw new LibraryMoveError("LIBRARY_MOVE_DESTINATION_MISSING");
  const destinationItems = orderedItems(destination.items).filter((item) => item.id !== sourceItem.id);
  const occupiedWithoutSource = destinationItems.reduce((total, item) => total + item.widthUnits, 0);
  if (input.destinationPosition > occupiedWithoutSource) throw new LibraryMoveError("LIBRARY_MOVE_POSITION_INVALID");
  if (occupiedWithoutSource + sourceItem.widthUnits > destination.capacityUnits) throw new LibraryMoveError("LIBRARY_MOVE_CAPACITY_EXCEEDED");

  let boundary = 0;
  const boundaries = new Set<number>([0]);
  for (const item of destinationItems) {
    boundary += item.widthUnits;
    boundaries.add(boundary);
  }
  if (!boundaries.has(input.destinationPosition)) throw new LibraryMoveError("LIBRARY_MOVE_POSITION_INVALID");
  const destinationAt = destinationItems.findIndex((item) => item.itemPosition >= input.destinationPosition);
  const insertionIndex = destinationAt === -1 ? destinationItems.length : destinationAt;
  if (destinationAt !== -1 && destinationItems[destinationAt].itemPosition !== input.destinationPosition) throw new LibraryMoveError("LIBRARY_MOVE_POSITION_INVALID");
  const movedItems = [...destinationItems.slice(0, insertionIndex), sourceItem, ...destinationItems.slice(insertionIndex)];
  let position = 0;
  const destinationAssignments = movedItems.map((item) => {
    const assignment = { placementId: item.id, shelfId: destination.id, moduleId: destination.moduleId, status: destination.status, itemPosition: position };
    position += item.widthUnits;
    return assignment;
  });
  const sourceAssignments = source.id === destination.id ? [] : (() => {
    let sourcePosition = 0;
    return orderedItems(source.items).filter((item) => item.id !== sourceItem.id).map((item) => {
      const assignment = { placementId: item.id, shelfId: source.id, moduleId: source.moduleId, status: source.status, itemPosition: sourcePosition };
      sourcePosition += item.widthUnits;
      return assignment;
    });
  })();
  return { sourceShelfId: source.id, destinationShelfId: destination.id, assignments: [...sourceAssignments, ...destinationAssignments] };
}

export function planPlacementSelectionMove(sourceShelves: readonly LibraryShelf[], destination: LibraryShelf, inputValue: unknown): SelectionMovePlan {
  const input = validateMoveSelectionInput(inputValue);
  const selected = sourceShelves.flatMap((shelf) => shelf.items.filter((item) => input.placementIds.includes(item.id)));
  if (selected.length !== input.placementIds.length) throw new LibraryMoveError("LIBRARY_MOVE_PLACEMENT_MISSING");
  for (const item of selected) if (input.expectedVersions[item.id] !== (item.version ?? 1)) throw new LibraryMoveError("LIBRARY_MOVE_VERSION_CONFLICT");
  const selectedIds = new Set(input.placementIds);
  const destinationItems = orderedItems(destination.items).filter((item) => !selectedIds.has(item.id));
  const occupiedWithoutSelection = destinationItems.reduce((total, item) => total + item.widthUnits, 0);
  const selectedWidth = selected.reduce((total, item) => total + item.widthUnits, 0);
  if (input.destinationPosition > occupiedWithoutSelection || occupiedWithoutSelection + selectedWidth > destination.capacityUnits) throw new LibraryMoveError("LIBRARY_MOVE_CAPACITY_EXCEEDED");
  let boundary = 0;
  const boundaries = new Set<number>([0]);
  for (const item of destinationItems) { boundary += item.widthUnits; boundaries.add(boundary); }
  if (!boundaries.has(input.destinationPosition)) throw new LibraryMoveError("LIBRARY_MOVE_POSITION_INVALID");
  const insertionIndex = destinationItems.findIndex((item) => item.itemPosition >= input.destinationPosition);
  const index = insertionIndex === -1 ? destinationItems.length : insertionIndex;
  const orderedSelection = [...selected].sort((left, right) => left.id.localeCompare(right.id));
  const movedItems = [...destinationItems.slice(0, index), ...orderedSelection, ...destinationItems.slice(index)];
  let destinationPosition = 0;
  const destinationAssignments = movedItems.map((item) => {
    const assignment = { placementId: item.id, shelfId: destination.id, moduleId: destination.moduleId, status: destination.status, itemPosition: destinationPosition };
    destinationPosition += item.widthUnits;
    return assignment;
  });
  const sourceAssignments = sourceShelves.flatMap((shelf) => {
    if (shelf.id === destination.id) return [];
    let position = 0;
    return orderedItems(shelf.items).filter((item) => !selectedIds.has(item.id)).map((item) => {
      const assignment = { placementId: item.id, shelfId: shelf.id, moduleId: shelf.moduleId, status: shelf.status, itemPosition: position };
      position += item.widthUnits;
      return assignment;
    });
  });
  return { destinationShelfId: destination.id, sourceShelfIds: sourceShelves.map((shelf) => shelf.id).sort(), assignments: [...sourceAssignments, ...destinationAssignments] };
}
