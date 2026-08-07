import type { CatalogProviderId } from "@/modules/catalog/domain/normalized-candidate";

export type CatalogueCandidate = Readonly<{
  candidateRef: string;
  title: string;
  subtitle?: string;
  authors: readonly string[];
  description?: string;
  languages: readonly string[];
  publicationDate?: string;
  identifiers: readonly string[];
  editions: readonly Readonly<{
    selectionRef: string;
    title: string;
    publicationDate?: string;
    pageCount?: number;
    languages: readonly string[];
    identifiers: readonly string[];
    provenance: readonly CatalogProviderId[];
    coverage: "not-provided" | "available";
  }>[];
  primaryProvider: CatalogProviderId;
  providers: readonly CatalogProviderId[];
}>;

type CatalogueResult = Readonly<{
  query: string;
  mode: "title" | "author";
  candidates: readonly CatalogueCandidate[];
}>;

export type CatalogueOutcome =
  | Readonly<{ status: "invalid" }>
  | (CatalogueResult & Readonly<{ status: "complete" | "partial" | "empty" | "unavailable" }>);

export type CatalogueSearchState = Readonly<{
  attempt: number;
  sessionUnavailable: boolean;
  sessionAnonymous?: boolean;
  outcome?: CatalogueOutcome;
}>;

export const CATALOGUE_INITIAL_STATE: CatalogueSearchState = { attempt: 0, sessionUnavailable: false };
