export type LibraryGroupStatusCounts = Readonly<Record<"want-to-read" | "in-progress" | "completed", number>>;

export type LibraryGroup = Readonly<{
  id: string;
  name: string;
  groupOrder: number;
  copyIds: readonly string[];
  statusCounts: LibraryGroupStatusCounts;
}>;

export type LibraryTheme = Readonly<{
  id: string;
  name: string;
  label: string;
  icon: string | null;
  pattern: string | null;
  color: string | null;
  copyIds: readonly string[];
}>;

export type CreateGroupInput = Readonly<{ name: string; copyIds: readonly string[] }>;
export type CreateThemeInput = Readonly<{ name: string; label: string; icon?: string | null; pattern?: string | null; color?: string | null }>;
export type AssignThemeInput = Readonly<{ themeId: string; copyIds: readonly string[] }>;
export type RemoveGroupMemberInput = Readonly<{ groupId: string; copyId: string }>;
export type RemoveThemeMemberInput = Readonly<{ themeId: string; copyId: string }>;

export class LibraryGroupsError extends Error {
  readonly code: string;

  constructor(code = "LIBRARY_GROUPS_INVALID") {
    super(code);
    this.name = "LibraryGroupsError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const ids = (value: unknown): value is readonly string[] => Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every((id) => typeof id === "string" && UUID.test(id)) && new Set(value).size === value.length;

export function validateCreateGroupInput(value: unknown): CreateGroupInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryGroupsError();
  const input = value as Record<string, unknown>;
  if (!text(input.name, 120) || !ids(input.copyIds)) throw new LibraryGroupsError();
  return { name: (input.name as string).trim(), copyIds: [...input.copyIds] };
}

export function validateCreateThemeInput(value: unknown): CreateThemeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryGroupsError();
  const input = value as Record<string, unknown>;
  if (!text(input.name, 80) || !text(input.label, 120)) throw new LibraryGroupsError();
  for (const key of ["icon", "pattern", "color"] as const) if (input[key] !== undefined && input[key] !== null && !text(input[key], 80)) throw new LibraryGroupsError();
  if (input.color !== null && input.color !== undefined && !/^#[0-9a-f]{6}$/i.test(input.color as string)) throw new LibraryGroupsError("LIBRARY_GROUPS_COLOR_INVALID");
  return { name: (input.name as string).trim(), label: (input.label as string).trim(), icon: input.icon === undefined ? null : input.icon as string | null, pattern: input.pattern === undefined ? null : input.pattern as string | null, color: input.color === undefined ? null : input.color as string | null };
}

export function validateAssignThemeInput(value: unknown): AssignThemeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryGroupsError();
  const input = value as Record<string, unknown>;
  if (typeof input.themeId !== "string" || !UUID.test(input.themeId) || !ids(input.copyIds)) throw new LibraryGroupsError();
  return { themeId: input.themeId, copyIds: [...input.copyIds] };
}

const validateRemoval = (value: unknown, key: "groupId" | "themeId"): string => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryGroupsError();
  const input = value as Record<string, unknown>;
  if (typeof input[key] !== "string" || !UUID.test(input[key] as string) || typeof input.copyId !== "string" || !UUID.test(input.copyId)) throw new LibraryGroupsError();
  return input[key] as string;
};

export function validateRemoveGroupMemberInput(value: unknown): RemoveGroupMemberInput {
  return { groupId: validateRemoval(value, "groupId"), copyId: (value as { copyId: string }).copyId };
}

export function validateRemoveThemeMemberInput(value: unknown): RemoveThemeMemberInput {
  return { themeId: validateRemoval(value, "themeId"), copyId: (value as { copyId: string }).copyId };
}
