import { MediaGovernanceError } from "../domain/media-governance";

export type CoverVariantRecord = Readonly<{
  assetId: string;
  userId: string;
  state: "quarantined" | "private" | "published" | "revoked";
  variantKind: "private-webp";
  objectKey: string;
}>;

export interface CoverVariantRepository {
  findVariant(userId: string, assetId: string): Promise<CoverVariantRecord | null>;
}

export interface PrivateMediaStorage {
  createSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
}

export type ResolveCoverUrlDependencies = Readonly<{
  repository: CoverVariantRepository;
  storage: PrivateMediaStorage;
  expiresInSeconds?: number;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_EXPIRY_SECONDS = 300;

/**
 * Resolves a cover only after the private database projection has checked ownership.
 * Object keys never leave this server-side boundary.
 */
export async function resolveCoverUrl(
  userId: string,
  assetId: string,
  dependencies: ResolveCoverUrlDependencies,
): Promise<string | null> {
  if (!UUID.test(userId) || !UUID.test(assetId)) return null;
  const variant = await dependencies.repository.findVariant(userId, assetId);
  if (!variant || variant.userId !== userId || variant.assetId !== assetId) return null;
  if (variant.state === "quarantined" || variant.state === "revoked") return null;
  if (variant.variantKind !== "private-webp" || !variant.objectKey) return null;

  const expiresInSeconds = dependencies.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS;
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 3600) {
    throw new MediaGovernanceError("MEDIA_INVALID_TRANSITION");
  }
  return dependencies.storage.createSignedUrl(variant.objectKey, expiresInSeconds);
}
