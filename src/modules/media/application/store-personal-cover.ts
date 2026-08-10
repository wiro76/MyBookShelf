import { createHash } from "node:crypto";
import { preparePersonalCover } from "./prepare-personal-cover";
import type { PersonalCoverInput, PreparedPersonalCover } from "../domain/personal-cover";
import type { PersonalCoverProcessor } from "./prepare-personal-cover";

export interface PersonalCoverObjectStore {
  putObject(objectKey: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export interface PersonalCoverRepository {
  savePrepared(input: Readonly<{
    userId: string;
    commandId: string;
    requestSha256: string;
    prepared: PreparedPersonalCover;
    originalObjectKey: string;
    variantObjectKey: string;
  }>): Promise<void>;
}

export async function storePersonalCover(
  userId: string,
  commandId: string,
  input: PersonalCoverInput,
  processor: PersonalCoverProcessor,
  dependencies: Readonly<{ objects: PersonalCoverObjectStore; repository: PersonalCoverRepository }>,
): Promise<{ assetId: string }> {
  const preparedBase = await preparePersonalCover(input, processor);
  const prepared = { ...preparedBase, assetId: userScopedAssetId(userId, preparedBase.originalSha256) };
  const originalObjectKey = `covers/${userId}/${prepared.assetId}/original`;
  const variantObjectKey = `covers/${userId}/${prepared.assetId}/variant.webp`;
  await dependencies.objects.putObject(originalObjectKey, input.bytes, input.declaredMimeType);
  await dependencies.objects.putObject(variantObjectKey, prepared.variant.bytes, prepared.variant.mimeType);
  await dependencies.repository.savePrepared({
    userId,
    commandId,
    requestSha256: createHash("sha256").update(`${userId}:${commandId}:${prepared.originalSha256}`).digest("hex"),
    prepared,
    originalObjectKey,
    variantObjectKey,
  });
  return { assetId: prepared.assetId };
}

function userScopedAssetId(userId: string, originalSha256: string): string {
  const hex = createHash("sha256").update(`${userId}:${originalSha256}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
