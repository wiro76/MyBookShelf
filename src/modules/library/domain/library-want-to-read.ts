import type { CatalogProviderId } from "@/modules/catalog/domain/normalized-candidate";

export type AddEditionAsWantToReadInput = Readonly<{
  candidateKey: string;
  editionKey: string;
  workTitle: string;
  editionTitle: string;
  identifiers: readonly string[];
  provenance: readonly CatalogProviderId[];
}>;

const HEX_KEY = /^edition-[0-9a-f]{32}$/u;
const CANDIDATE_KEY = /^candidate_[0-9a-f]{64}$/u;
const PROVIDERS: readonly CatalogProviderId[] = ["google-books", "open-library", "bnf"];

export class LibraryWantToReadError extends Error {
  readonly code: string;
  constructor(code = "LIBRARY_WANT_TO_READ_INVALID") {
    super(code);
    this.name = "LibraryWantToReadError";
    this.code = code;
  }
}

const text = (value: unknown, max: number) => {
  if (typeof value !== "string") throw new LibraryWantToReadError();
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > max) throw new LibraryWantToReadError();
  return normalized;
};

export function validateAddEditionAsWantToRead(value: unknown): AddEditionAsWantToReadInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LibraryWantToReadError();
  const input = value as Record<string, unknown>;
  if (!CANDIDATE_KEY.test(String(input.candidateKey)) || !HEX_KEY.test(String(input.editionKey))) throw new LibraryWantToReadError();
  if (!Array.isArray(input.identifiers) || input.identifiers.length > 20 || !Array.isArray(input.provenance) || input.provenance.length === 0 || input.provenance.some((provider) => !PROVIDERS.includes(provider as CatalogProviderId))) throw new LibraryWantToReadError();
  return {
    candidateKey: String(input.candidateKey),
    editionKey: String(input.editionKey),
    workTitle: text(input.workTitle, 500),
    editionTitle: text(input.editionTitle, 500),
    identifiers: input.identifiers.map((identifier) => text(identifier, 200)),
    provenance: [...new Set(input.provenance as CatalogProviderId[])],
  };
}
