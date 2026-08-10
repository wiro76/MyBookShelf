"use server";

import { revalidatePath } from "next/cache";
import { createPostgresLibraryMoveRepository } from "@/modules/library/adapters/postgres-library-move";
import { getVerifiedSession } from "@/modules/identity/application/session";

export type MoveActionState = Readonly<{ status: "idle" | "confirmed" | "replayed" | "invalid" | "conflict" | "unavailable" }>;
export type MoveSelectionActionState = Readonly<MoveActionState & { commandId?: string }>;

export async function deplacerExemplaire(previousState: MoveActionState, formData: FormData): Promise<MoveActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const commandId = String(formData.get("commandId") ?? "");
  const placementId = String(formData.get("placementId") ?? "");
  const destinationShelfId = String(formData.get("destinationShelfId") ?? "");
  const destinationPosition = Number(formData.get("destinationPosition"));
  const expectedVersion = Number(formData.get("expectedVersion"));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(commandId)
      || !placementId || !destinationShelfId || !Number.isSafeInteger(destinationPosition) || destinationPosition < 0
      || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return { status: "invalid" };
  try {
    const receipt = await createPostgresLibraryMoveRepository().move(session.user.id, commandId, { placementId, destinationShelfId, destinationPosition, expectedVersion });
    revalidatePath("/bibliotheque");
    return { status: receipt.status };
  } catch (error) {
    if (error instanceof Error && error.message === "LIBRARY_MOVE_VERSION_CONFLICT") return { status: "conflict" };
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}

export async function annulerDeplacementSelection(previousState: MoveSelectionActionState, formData: FormData): Promise<MoveSelectionActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const originalCommandId = String(formData.get("originalCommandId") ?? "");
  const undoCommandId = String(formData.get("undoCommandId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(originalCommandId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(undoCommandId)) return { status: "invalid" };
  try {
    const receipt = await createPostgresLibraryMoveRepository().undoSelection(session.user.id, undoCommandId, originalCommandId);
    revalidatePath("/bibliotheque");
    return { status: receipt.status, commandId: originalCommandId };
  } catch (error) {
    if (error instanceof Error && error.message === "LIBRARY_MOVE_VERSION_CONFLICT") return { status: "conflict", commandId: originalCommandId };
    return previousState.status === "confirmed" ? previousState : { status: "invalid", commandId: originalCommandId };
  }
}

export async function deplacerSelection(previousState: MoveSelectionActionState, formData: FormData): Promise<MoveSelectionActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const commandId = String(formData.get("commandId") ?? "");
  const destinationShelfId = String(formData.get("destinationShelfId") ?? "");
  let placementIds: unknown;
  let expectedVersions: unknown;
  try {
    placementIds = JSON.parse(String(formData.get("placementIds") ?? "null"));
    expectedVersions = JSON.parse(String(formData.get("expectedVersions") ?? "null"));
  } catch { return { status: "invalid" }; }
  const destinationPosition = Number(formData.get("destinationPosition"));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(commandId)
      || !destinationShelfId || !Number.isSafeInteger(destinationPosition) || destinationPosition < 0) return { status: "invalid" };
  try {
    const receipt = await createPostgresLibraryMoveRepository().moveSelection(session.user.id, commandId, { placementIds: placementIds as string[], destinationShelfId, destinationPosition, expectedVersions: expectedVersions as Record<string, number> });
    revalidatePath("/bibliotheque");
    return { status: receipt.status, commandId: receipt.commandId };
  } catch (error) {
    if (error instanceof Error && error.message === "LIBRARY_MOVE_VERSION_CONFLICT") return { status: "conflict" };
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}
