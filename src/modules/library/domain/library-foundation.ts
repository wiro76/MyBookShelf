import { LIBRARY_STATUSES, type LibraryStatus } from "./library-view-state";

export const DEFAULT_SHELF_COUNT = 5;
export const DEFAULT_SHELF_CAPACITY_UNITS = 20;

export type LibraryShelf = Readonly<{
  id: string;
  moduleId: string;
  status: LibraryStatus;
  shelfPosition: number;
  capacityUnits: number;
  occupiedUnits: number;
}>;

export type LibraryModule = Readonly<{
  id: string;
  status: LibraryStatus;
  modulePosition: number;
  capacityUnits: number;
  shelves: readonly LibraryShelf[];
}>;

export type LibraryProjection = Readonly<{
  statuses: readonly Readonly<{
    status: LibraryStatus;
    modules: readonly LibraryModule[];
  }>[];
}>;

export type AppendPlacementInput = Readonly<{
  status: LibraryStatus;
  copyId: string;
  widthUnits: number;
}>;

export type AppendPlacementPlan = Readonly<{
  status: LibraryStatus;
  copyId: string;
  modulePosition: number;
  shelfPosition: number;
  itemPosition: number;
  createdModule: boolean;
}>;

export class LibraryFoundationError extends Error {
  readonly code: string;

  constructor(code = "LIBRARY_FOUNDATION_INVALID") {
    super(code);
    this.name = "LibraryFoundationError";
    this.code = code;
  }
}

const isIndex = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isPositive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export function validateAppendPlacementInput(value: unknown): AppendPlacementInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryFoundationError();
  const input = value as Record<string, unknown>;
  if (!LIBRARY_STATUSES.includes(input.status as LibraryStatus) || typeof input.copyId !== "string" || !input.copyId || !isPositive(input.widthUnits)) {
    throw new LibraryFoundationError();
  }
  return { status: input.status as LibraryStatus, copyId: input.copyId, widthUnits: input.widthUnits };
}

export function planAppendPlacement(
  modules: readonly LibraryModule[],
  inputValue: unknown,
): AppendPlacementPlan {
  const input = validateAppendPlacementInput(inputValue);
  const statusModules = modules.filter((module) => module.status === input.status).sort((left, right) => left.modulePosition - right.modulePosition);
  const lastModule = statusModules.at(-1);
  if (!lastModule) throw new LibraryFoundationError("LIBRARY_FOUNDATION_NOT_INITIALIZED");
  const shelves = [...lastModule.shelves].sort((left, right) => left.shelfPosition - right.shelfPosition);
  for (const shelf of shelves) {
    if (shelf.occupiedUnits + input.widthUnits <= shelf.capacityUnits) {
      return {
        status: input.status,
        copyId: input.copyId,
        modulePosition: lastModule.modulePosition,
        shelfPosition: shelf.shelfPosition,
        itemPosition: shelf.occupiedUnits,
        createdModule: false,
      };
    }
  }
  if (!isIndex(lastModule.modulePosition)) throw new LibraryFoundationError();
  return {
    status: input.status,
    copyId: input.copyId,
    modulePosition: lastModule.modulePosition + 1,
    shelfPosition: 0,
    itemPosition: 0,
    createdModule: true,
  };
}

export function validateLibraryProjection(value: unknown): LibraryProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryFoundationError();
  const statuses = (value as { statuses?: unknown }).statuses;
  if (!Array.isArray(statuses) || statuses.length !== LIBRARY_STATUSES.length) throw new LibraryFoundationError();
  const seen = new Set<string>();
  for (const entry of statuses) {
    if (!entry || typeof entry !== "object" || !LIBRARY_STATUSES.includes((entry as { status?: unknown }).status as LibraryStatus)) throw new LibraryFoundationError();
    const status = (entry as { status: LibraryStatus }).status;
    if (seen.has(status) || !Array.isArray((entry as { modules?: unknown }).modules)) throw new LibraryFoundationError();
    seen.add(status);
  }
  return value as LibraryProjection;
}
