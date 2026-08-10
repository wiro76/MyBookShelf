import type { CatalogProviderId, NormalizedCandidate } from "../domain/normalized-candidate";

export type CatalogSearchRequest = Readonly<{
  mode: "title" | "author";
  query: string;
}>;

export interface CatalogProvider {
  readonly id: CatalogProviderId;
  search(request: CatalogSearchRequest, signal: AbortSignal): Promise<readonly NormalizedCandidate[]>;
}

export type CatalogProviderFailure = Readonly<{
  provider: CatalogProviderId;
  code: "CATALOG_PROVIDER_FAILED" | "CATALOG_PROVIDER_TIMEOUT";
}>;

type CatalogSearchResult = Readonly<{
  query: string;
  mode: CatalogSearchRequest["mode"];
  candidates: readonly NormalizedCandidate[];
  failures: readonly CatalogProviderFailure[];
}>;

export type CatalogSearchOutcome =
  | Readonly<{ status: "invalid"; code: "CATALOG_QUERY_INVALID" }>
  | (CatalogSearchResult & Readonly<{ status: "complete" | "partial" }>)
  | (CatalogSearchResult & Readonly<{ status: "empty" | "unavailable" }>);
