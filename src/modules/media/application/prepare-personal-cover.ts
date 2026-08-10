import { createHash } from "node:crypto";
import {
  assertPixelLimit,
  detectPersonalCoverMimeType,
  PersonalCoverValidationError,
  validatePersonalCoverEnvelope,
  type PersonalCoverInput,
  type PreparedPersonalCover,
} from "../domain/personal-cover";

export interface PersonalCoverProcessor {
  inspect(bytes: Uint8Array): Promise<{ format: string; width: number; height: number }>;
  createPrivateVariant(bytes: Uint8Array): Promise<{ bytes: Uint8Array; width: number; height: number }>;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function preparePersonalCover(input: PersonalCoverInput, processor: PersonalCoverProcessor): Promise<PreparedPersonalCover> {
  const mimeType = validatePersonalCoverEnvelope(input);
  const inspected = await processor.inspect(input.bytes).catch(() => { throw new PersonalCoverValidationError("INVALID_BYTES"); });
  if (detectPersonalCoverMimeType(input.bytes) !== mimeType || inspected.format !== mimeType) throw new PersonalCoverValidationError("INVALID_BYTES");
  assertPixelLimit(inspected.width, inspected.height);
  const variant = await processor.createPrivateVariant(input.bytes).catch(() => { throw new PersonalCoverValidationError("INVALID_BYTES"); });
  assertPixelLimit(variant.width, variant.height);
  const originalSha256 = sha256(input.bytes);
  const variantSha256 = sha256(variant.bytes);
  return {
    assetId: sha256ToUuid(originalSha256),
    state: "quarantined",
    originalSha256,
    originalBytes: input.bytes.byteLength,
    width: inspected.width,
    height: inspected.height,
    variant: { ...variant, sha256: variantSha256, mimeType: "image/webp" },
    provenance: {
      source: "personal-upload",
      declaredMimeType: input.declaredMimeType,
      ...(input.originalFileName ? { originalFileName: input.originalFileName } : {}),
      rightsConfirmed: true,
    },
  };
}

function sha256ToUuid(hash: string) {
  const hex = hash.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
