"use server";

import { revalidatePath } from "next/cache";
import { createPostgresLibraryGroupsRepository } from "@/modules/library/adapters/postgres-library-groups";
import { getVerifiedSession } from "@/modules/identity/application/session";

export type GroupActionState = Readonly<{ status: "idle" | "confirmed" | "replayed" | "invalid" | "unavailable" | "conflict" }>;
export type ThemeActionState = GroupActionState;

export async function creerGroupe(previousState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const commandId = String(formData.get("commandId") ?? "");
  const name = String(formData.get("name") ?? "");
  const copyIds = formData.getAll("copyId").map(String);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(commandId)) return { status: "invalid" };
  try {
    const receipt = await createPostgresLibraryGroupsRepository().createGroup(session.user.id, commandId, { name, copyIds });
    revalidatePath("/bibliotheque");
    return { status: receipt.status };
  } catch (error) {
    if (error instanceof Error && error.message === "LIBRARY_GROUP_COMMAND_REUSED") return { status: "conflict" };
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}

export async function creerTheme(previousState: ThemeActionState, formData: FormData): Promise<ThemeActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const commandId = String(formData.get("commandId") ?? "");
  const input = { name: String(formData.get("name") ?? ""), label: String(formData.get("label") ?? ""), icon: String(formData.get("icon") ?? "") || null, pattern: String(formData.get("pattern") ?? "") || null, color: String(formData.get("color") ?? "") || null };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(commandId)) return { status: "invalid" };
  try {
    const receipt = await createPostgresLibraryGroupsRepository().createTheme(session.user.id, commandId, input);
    revalidatePath("/bibliotheque");
    return { status: receipt.status };
  } catch (error) {
    if (error instanceof Error && error.message === "LIBRARY_THEME_COMMAND_REUSED") return { status: "conflict" };
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}

export async function associerTheme(previousState: ThemeActionState, formData: FormData): Promise<ThemeActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const commandId = String(formData.get("commandId") ?? "");
  const themeId = String(formData.get("themeId") ?? "");
  const copyIds = formData.getAll("copyId").map(String);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(commandId)) return { status: "invalid" };
  try {
    const receipt = await createPostgresLibraryGroupsRepository().assignTheme(session.user.id, commandId, { themeId, copyIds });
    revalidatePath("/bibliotheque");
    return { status: receipt.status };
  } catch (error) {
    if (error instanceof Error && error.message === "LIBRARY_THEME_COMMAND_REUSED") return { status: "conflict" };
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}
