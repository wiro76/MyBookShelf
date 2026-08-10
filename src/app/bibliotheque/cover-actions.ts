"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getVerifiedSession } from "@/modules/identity/application/session";
import { createPostgresCopyCoverRepository } from "@/modules/library/adapters/postgres-copy-cover";
import { createPostgresPersonalCoverRepository } from "@/modules/media/adapters/postgres-personal-cover";
import { createSupabasePrivateMediaStorage } from "@/modules/media/adapters/supabase-private-media-storage";
import { createSharpPersonalCoverProcessor } from "@/modules/media/adapters/sharp-personal-cover";
import { storePersonalCover } from "@/modules/media/application/store-personal-cover";

export type CoverUploadState = Readonly<{ status: "idle" | "confirmed" | "invalid" | "unavailable" }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function importerCouverture(previousState: CoverUploadState, formData: FormData): Promise<CoverUploadState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  const copyId = String(formData.get("copyId") ?? "");
  const file = formData.get("cover");
  if (!UUID.test(copyId) || !(file instanceof File) || file.size === 0 || formData.get("rightsConfirmed") !== "on") return { status: "invalid" };
  try {
    const storage = createSupabasePrivateMediaStorage();
    const { assetId } = await storePersonalCover(
      session.user.id,
      randomUUID(),
      { bytes: new Uint8Array(await file.arrayBuffer()), declaredMimeType: file.type, rightsConfirmed: true, originalFileName: file.name },
      createSharpPersonalCoverProcessor(),
      { objects: storage, repository: createPostgresPersonalCoverRepository() },
    );
    await createPostgresCopyCoverRepository().setPreferredCover(session.user.id, copyId, assetId);
    revalidatePath("/bibliotheque");
    return { status: "confirmed" };
  } catch {
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}
