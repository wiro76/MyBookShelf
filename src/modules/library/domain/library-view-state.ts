export const LIBRARY_STATUSES = ["finished", "want-to-read", "reading"] as const;

export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export type LibraryResumeTarget = {
  status: LibraryStatus;
  moduleId: string;
  shelfId: string;
  copyId: string;
  modulePosition: number;
  shelfPosition: number;
  itemPosition: number;
};

export type StoredLibraryViewState = {
  status: LibraryStatus;
  moduleId: string | null;
  shelfId: string | null;
  copyId: string | null;
  modulePosition: number | null;
  shelfPosition: number | null;
  itemPosition: number | null;
  revision: number;
  confirmedAt: string;
};

export class LibraryViewStateError extends Error {
  readonly code: string;

  constructor(code = "LIBRARY_VIEW_STATE_INVALID") {
    super(code);
    this.name = "LibraryViewStateError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADJUSTED_ANNOUNCEMENT = "Ta dernière place n'existe plus. La position disponible la plus proche est ouverte.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isIndex = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isStatus = (value: unknown): value is LibraryStatus => LIBRARY_STATUSES.includes(value as LibraryStatus);

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");

export function validateLibraryResumeTarget(value: unknown): LibraryResumeTarget {
  const keys = ["status", "moduleId", "shelfId", "copyId", "modulePosition", "shelfPosition", "itemPosition"];
  if (
    !isRecord(value) || !exactKeys(value, keys) || !isStatus(value.status) ||
    !isUuid(value.moduleId) || !isUuid(value.shelfId) || !isUuid(value.copyId) ||
    !isIndex(value.modulePosition) || !isIndex(value.shelfPosition) || !isIndex(value.itemPosition)
  ) {
    throw new LibraryViewStateError();
  }
  return value as LibraryResumeTarget;
}

export function validateStoredLibraryViewState(value: unknown): StoredLibraryViewState {
  const keys = [
    "status", "moduleId", "shelfId", "copyId", "modulePosition", "shelfPosition", "itemPosition", "revision", "confirmedAt",
  ];
  if (!isRecord(value) || !exactKeys(value, keys) || !isStatus(value.status)) throw new LibraryViewStateError();

  const pairs = [
    [value.moduleId, value.modulePosition],
    [value.shelfId, value.shelfPosition],
    [value.copyId, value.itemPosition],
  ] as const;
  if (pairs.some(([id, position]) => (id === null) !== (position === null))) throw new LibraryViewStateError();
  if (pairs.some(([id, position]) => id !== null && (!isUuid(id) || !isIndex(position)))) throw new LibraryViewStateError();
  if ((value.shelfId !== null && value.moduleId === null) || (value.copyId !== null && value.shelfId === null)) {
    throw new LibraryViewStateError();
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw new LibraryViewStateError();
  if (typeof value.confirmedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.confirmedAt)) {
    throw new LibraryViewStateError();
  }
  const instant = new Date(value.confirmedAt);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value.confirmedAt) throw new LibraryViewStateError();
  return value as StoredLibraryViewState;
}

const canonicalCompare = (left: LibraryResumeTarget, right: LibraryResumeTarget) =>
  LIBRARY_STATUSES.indexOf(left.status) - LIBRARY_STATUSES.indexOf(right.status) ||
  left.modulePosition - right.modulePosition ||
  left.shelfPosition - right.shelfPosition ||
  left.itemPosition - right.itemPosition ||
  left.moduleId.localeCompare(right.moduleId) ||
  left.shelfId.localeCompare(right.shelfId) ||
  left.copyId.localeCompare(right.copyId);

const nearest = (
  candidates: readonly LibraryResumeTarget[],
  state: StoredLibraryViewState,
  dimensions: readonly (keyof Pick<LibraryResumeTarget, "modulePosition" | "shelfPosition" | "itemPosition">)[],
) => [...candidates].sort((left, right) => {
  for (const dimension of dimensions) {
    const anchor = state[dimension] ?? 0;
    const distance = Math.abs(left[dimension] - anchor) - Math.abs(right[dimension] - anchor);
    if (distance !== 0) return distance;
    const lowerIndex = left[dimension] - right[dimension];
    if (lowerIndex !== 0) return lowerIndex;
  }
  return canonicalCompare(left, right);
})[0];

const adjusted = (target: LibraryResumeTarget) => ({
  status: "adjusted" as const,
  target,
  adjusted: true as const,
  announcement: ADJUSTED_ANNOUNCEMENT,
});

export function resolveLibraryViewState(stateValue: unknown, targetValues: readonly unknown[]) {
  if (!Array.isArray(targetValues)) throw new LibraryViewStateError();
  const targets = targetValues.map(validateLibraryResumeTarget).sort(canonicalCompare);
  if (targets.length === 0) {
    return { status: "empty" as const, adjusted: false as const, focusTarget: "library-title" as const, announcement: null };
  }
  if (stateValue === null || stateValue === undefined) {
    return { status: "default" as const, target: targets[0], adjusted: false as const, announcement: null };
  }

  const state = validateStoredLibraryViewState(stateValue);
  if (state.copyId !== null) {
    const currentCopy = targets.find(({ copyId }) => copyId === state.copyId);
    if (currentCopy) {
      const samePath = currentCopy.status === state.status && currentCopy.moduleId === state.moduleId && currentCopy.shelfId === state.shelfId;
      return samePath
        ? { status: "exact" as const, target: currentCopy, adjusted: false as const, announcement: null }
        : adjusted(currentCopy);
    }
  }

  const sameShelf = state.shelfId === null ? [] : targets.filter(({ shelfId }) => shelfId === state.shelfId);
  if (sameShelf.length > 0) return adjusted(nearest(sameShelf, state, ["itemPosition"]));

  const sameModule = state.moduleId === null ? [] : targets.filter(({ moduleId }) => moduleId === state.moduleId);
  if (sameModule.length > 0) return adjusted(nearest(sameModule, state, ["shelfPosition", "itemPosition"]));

  const sameStatus = targets.filter(({ status }) => status === state.status);
  if (sameStatus.length > 0) return adjusted(nearest(sameStatus, state, ["modulePosition", "shelfPosition", "itemPosition"]));

  return adjusted(targets[0]);
}
