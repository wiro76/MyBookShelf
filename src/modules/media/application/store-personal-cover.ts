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
  const prepared = await preparePersonalCover(input, processor);
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
