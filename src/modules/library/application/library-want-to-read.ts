import { createHash } from "node:crypto";
import { validateAddEditionAsWantToRead, type AddEditionAsWantToReadInput } from "../domain/library-want-to-read";

export type LibraryWantToReadReceipt = Readonly<{
  commandId: string;
  status: "confirmed" | "replayed";
  copyId: string;
  placementId: string;
  confirmedAt: string;
}>;

export interface LibraryWantToReadRepository {
  addEditionAsWantToRead(userId: string, commandId: string, input: AddEditionAsWantToReadInput): Promise<LibraryWantToReadReceipt>;
}

export { validateAddEditionAsWantToRead };

export const wantToReadRequestDigest = (commandId: string, userId: string, input: AddEditionAsWantToReadInput) =>
  createHash("sha256").update(JSON.stringify({ commandId, userId, ...input })).digest("hex");
