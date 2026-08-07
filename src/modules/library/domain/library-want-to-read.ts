import type { CatalogProviderId } from "@/modules/catalog/domain/normalized-candidate";

export type AddEditionAsWantToReadInput = Readonly<{
  candidateKey: string;
  editionKey: string;
  workTitle: string;
  editionTitle: string;
  identifiers: readonly string[];
  provenance: readonly CatalogProviderId[];
  author?: string;
  summary?: string;
  pageCount?: number;
  series?: string;
  volume?: string;
  publicationDate?: string;
  editionStatement?: string;
  coverAssetId?: string;
}>;

const HEX_KEY = /^edition-[0-9a-f]{32}$/u;
const CANDIDATE_KEY = /^candidate_[0-9a-f]{64}$/u;
const PROVIDERS: readonly CatalogProviderId[] = ["google-books", "open-library", "bnf", "manual"];

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
    ...(input.author !== undefined ? { author: text(input.author, 500) } : {}),
    ...(input.summary !== undefined ? { summary: text(input.summary, 10_000) } : {}),
    ...(input.pageCount !== undefined ? { pageCount: validatePageCount(input.pageCount) } : {}),
    ...(input.series !== undefined ? { series: text(input.series, 500) } : {}),
    ...(input.volume !== undefined ? { volume: text(input.volume, 100) } : {}),
    ...(input.publicationDate !== undefined ? { publicationDate: text(input.publicationDate, 100) } : {}),
    ...(input.editionStatement !== undefined ? { editionStatement: text(input.editionStatement, 500) } : {}),
    ...(input.coverAssetId !== undefined ? { coverAssetId: text(input.coverAssetId, 100) } : {}),
};

function validatePageCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 100_000) throw new LibraryWantToReadError();
  return value;
}
}
