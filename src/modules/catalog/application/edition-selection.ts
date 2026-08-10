import { createHash } from "node:crypto";

/** A stable browser-safe handle; source identifiers and claims never cross the boundary. */
export function createEditionSelectionRef(candidateRef: string, editionRef: string): string {
  return `edition-${createHash("sha256").update(`${candidateRef}\u0000${editionRef}`).digest("hex").slice(0, 32)}`;
}
