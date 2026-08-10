export const PERSONAL_COVER_LIMITS = {
  maxBytes: 20 * 1024 * 1024,
  maxPixels: 40_000_000,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"] as const,
} as const;

export type PersonalCoverMimeType = (typeof PERSONAL_COVER_LIMITS.acceptedMimeTypes)[number];
export type PersonalCoverState = "quarantined" | "private";

export type PersonalCoverInput = Readonly<{
  bytes: Uint8Array;
  declaredMimeType: string;
  rightsConfirmed: boolean;
  originalFileName?: string;
}>;

export type PreparedPersonalCover = Readonly<{
  assetId: string;
  state: PersonalCoverState;
  originalSha256: string;
  originalBytes: number;
  width: number;
  height: number;
  variant: Readonly<{
    sha256: string;
    bytes: Uint8Array;
    mimeType: "image/webp";
    width: number;
    height: number;
  }>;
  provenance: Readonly<{
    source: "personal-upload";
    declaredMimeType: string;
    originalFileName?: string;
    rightsConfirmed: true;
  }>;
}>;

export class PersonalCoverValidationError extends Error {
  readonly code: "RIGHTS_REQUIRED" | "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE" | "INVALID_BYTES" | "TOO_MANY_PIXELS";

  constructor(code: "RIGHTS_REQUIRED" | "EMPTY_FILE" | "FILE_TOO_LARGE" | "UNSUPPORTED_TYPE" | "INVALID_BYTES" | "TOO_MANY_PIXELS") {
    super(code);
    this.code = code;
    this.name = "PersonalCoverValidationError";
  }
}

export function normalizePersonalCoverMimeType(value: string): PersonalCoverMimeType {
  const mimeType = value.trim().toLowerCase();
  if ((PERSONAL_COVER_LIMITS.acceptedMimeTypes as readonly string[]).includes(mimeType)) return mimeType as PersonalCoverMimeType;
  throw new PersonalCoverValidationError("UNSUPPORTED_TYPE");
}

export function validatePersonalCoverEnvelope(input: PersonalCoverInput): PersonalCoverMimeType {
  if (!input.rightsConfirmed) throw new PersonalCoverValidationError("RIGHTS_REQUIRED");
  if (input.bytes.byteLength === 0) throw new PersonalCoverValidationError("EMPTY_FILE");
  if (input.bytes.byteLength > PERSONAL_COVER_LIMITS.maxBytes) throw new PersonalCoverValidationError("FILE_TOO_LARGE");
  return normalizePersonalCoverMimeType(input.declaredMimeType);
}

export function assertPixelLimit(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new PersonalCoverValidationError("INVALID_BYTES");
  if (width * height > PERSONAL_COVER_LIMITS.maxPixels) throw new PersonalCoverValidationError("TOO_MANY_PIXELS");
}

export function detectPersonalCoverMimeType(bytes: Uint8Array): PersonalCoverMimeType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index])) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))) return "image/avif";
  throw new PersonalCoverValidationError("INVALID_BYTES");
}

export function promotePersonalCover(asset: PreparedPersonalCover): PreparedPersonalCover {
  if (asset.state !== "quarantined") throw new Error("MEDIA_ASSET_INVALID_TRANSITION");
  return { ...asset, state: "private" };
}
