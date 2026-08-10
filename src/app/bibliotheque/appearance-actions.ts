"use server";

import { getVerifiedSession } from "@/modules/identity/application/session";
import { createPostgresLibraryAppearanceRepository } from "@/modules/library/adapters/postgres-library-appearance";
import { validateAppearanceCommand } from "@/modules/library/application/library-appearance";

export type AppearanceActionState = Readonly<{ status: "idle" | "confirmed" | "invalid" | "unavailable"; structureId?: string; finishId?: string }>;

export async function enregistrerApparence(previousState: AppearanceActionState, formData: FormData): Promise<AppearanceActionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  try {
    const preference = validateAppearanceCommand({ structureId: formData.get("structureId"), finishId: formData.get("finishId") });
    const commandId = String(formData.get("commandId") ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(commandId)) return { status: "invalid" };
    const receipt = await createPostgresLibraryAppearanceRepository().save(session.user.id, preference, commandId);
    return { status: "confirmed", structureId: receipt.structureId, finishId: receipt.finishId };
  } catch {
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}
