export type MediaGcDecision = "eligible" | "referenced" | "backup-retained" | "retention-active";

export type MediaGcInput = Readonly<{
  state: "quarantined" | "private" | "published" | "revoked";
  revokedAt?: string;
  hasActiveReference: boolean;
  objectHashes: readonly string[];
  retainedHashes: ReadonlySet<string>;
  now: Date;
  retentionUntil?: Date;
}>;

export function evaluateMediaGc(input: MediaGcInput): MediaGcDecision {
  if (input.state !== "revoked" || input.hasActiveReference) return input.hasActiveReference ? "referenced" : "retention-active";
  if (!input.revokedAt || !Number.isFinite(new Date(input.revokedAt).getTime())) return "retention-active";
  if (input.retainedHashes.size > 0 && input.objectHashes.some((hash) => input.retainedHashes.has(hash))) return "backup-retained";
  if (!input.retentionUntil || input.retentionUntil.getTime() > input.now.getTime()) return "retention-active";
  return "eligible";
}
