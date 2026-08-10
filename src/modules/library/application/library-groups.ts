import { createHash } from "node:crypto";
import { validateAssignThemeInput, validateCreateGroupInput, validateCreateThemeInput, type AssignThemeInput, type CreateGroupInput, type CreateThemeInput, type LibraryGroup, type LibraryTheme } from "../domain/library-groups";

export type LibraryGroupReceipt = Readonly<{ commandId: string; commandType: "library.group.create"; status: "confirmed" | "replayed"; group: LibraryGroup; confirmedAt: string }>;
export type LibraryThemeReceipt = Readonly<{ commandId: string; commandType: "library.theme.create" | "library.theme.assign"; status: "confirmed" | "replayed"; theme: LibraryTheme; confirmedAt: string }>;

export interface LibraryGroupsRepository {
  createGroup(userId: string, commandId: string, input: CreateGroupInput): Promise<LibraryGroupReceipt>;
  createTheme(userId: string, commandId: string, input: CreateThemeInput): Promise<LibraryThemeReceipt>;
  assignTheme(userId: string, commandId: string, input: AssignThemeInput): Promise<LibraryThemeReceipt>;
}

const digest = (type: string, commandId: string, userId: string, input: unknown) => createHash("sha256").update(JSON.stringify({ type, commandId, userId, input })).digest("hex");
export const groupRequestDigest = (commandId: string, userId: string, input: unknown) => digest("group", commandId, userId, validateCreateGroupInput(input));
export const themeRequestDigest = (commandId: string, userId: string, input: unknown) => digest("theme", commandId, userId, validateCreateThemeInput(input));
export const themeAssignmentDigest = (commandId: string, userId: string, input: unknown) => digest("theme-assignment", commandId, userId, validateAssignThemeInput(input));
