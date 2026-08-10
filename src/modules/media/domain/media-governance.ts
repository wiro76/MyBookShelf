export type MediaAssetState = "quarantined" | "private" | "published" | "revoked";
export type MediaRightsStatus = "known" | "unknown";

export class MediaGovernanceError extends Error {
  readonly code: "MEDIA_INVALID_TRANSITION" | "MEDIA_RIGHTS_REQUIRED" | "MEDIA_ALREADY_REVOKED";

  constructor(code: "MEDIA_INVALID_TRANSITION" | "MEDIA_RIGHTS_REQUIRED" | "MEDIA_ALREADY_REVOKED") {
    super(code);
    this.code = code;
    this.name = "MediaGovernanceError";
  }
}

export function transitionMediaAsset(state: MediaAssetState, target: MediaAssetState, rights: MediaRightsStatus): MediaAssetState {
  if (state === "revoked") throw new MediaGovernanceError("MEDIA_ALREADY_REVOKED");
  if (state === "quarantined" && target === "private") return target;
  if (state === "private" && target === "published") {
    if (rights !== "known") throw new MediaGovernanceError("MEDIA_RIGHTS_REQUIRED");
    return target;
  }
  if ((state === "private" || state === "published") && target === "revoked") return target;
  throw new MediaGovernanceError("MEDIA_INVALID_TRANSITION");
}
