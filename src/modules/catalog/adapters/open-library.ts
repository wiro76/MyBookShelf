import type { CatalogEnvironment } from "@/shared/config/environment";
import { requireCatalogEnvironment, validateCatalogEnvironment } from "@/shared/config/environment";
import type { CatalogProvider, CatalogSearchRequest } from "../application/catalog-provider";
import { createNormalizedCandidate, createSourceClaim, type CandidateIdentifier, type EditionCandidate } from "../domain/normalized-candidate";
import { boundedStrings, boundedText, normalizeIsbnIdentifier, provenanced } from "./adapter-types";
import { fetchCatalogDocument } from "./catalog-http";

const OPEN_LIBRARY_FIELDS = "key,title,author_name,first_publish_year,editions,editions.key,editions.title,editions.publish_date,editions.isbn,editions.language,editions.number_of_pages_median";
type Dependencies = { fetch?: typeof fetch; now?: () => Date; environment?: CatalogEnvironment };

type ParsedEdition = {
  sourceId: string;
  title: string;
  publicationDate?: string;
  pageCount?: number;
  languages: string[];
  identifiers: CandidateIdentifier[];
};

function parseEditions(value: unknown): ParsedEdition[] {
  const docs = value && typeof value === "object" && Array.isArray((value as { docs?: unknown }).docs)
    ? (value as { docs: unknown[] }).docs : [];
  return docs.slice(0, 50).flatMap((edition) => {
    if (!edition || typeof edition !== "object") return [];
    const data = edition as Record<string, unknown>;
    const sourceId = boundedText(data.key, 256);
    const title = boundedText(data.title);
    if (!sourceId || !title) return [];
    const identifiers = boundedStrings(data.isbn).map(normalizeIsbnIdentifier).filter((item) => item !== undefined);
    const pageCount = typeof data.number_of_pages_median === "number" && Number.isSafeInteger(data.number_of_pages_median) && data.number_of_pages_median > 0 ? data.number_of_pages_median : undefined;
    const publicationDate = boundedStrings(data.publish_date)[0];
    return [{ sourceId, title, ...(publicationDate ? { publicationDate } : {}), ...(pageCount ? { pageCount } : {}), languages: boundedStrings(data.language), identifiers }];
  });
}

function toEditions(values: readonly ParsedEdition[], claimRef: string): EditionCandidate[] {
  return values.map((edition) => ({
    editionRef: `open-library:${edition.sourceId}`,
    title: provenanced(edition.title, claimRef),
    ...(edition.publicationDate ? { publicationDate: provenanced(edition.publicationDate, claimRef) } : {}),
    ...(edition.pageCount ? { pageCount: provenanced(edition.pageCount, claimRef) } : {}),
    languages: edition.languages.map((item) => provenanced(item, claimRef)),
    identifiers: edition.identifiers.map((item) => provenanced(item, claimRef)),
  }));
}

export function createOpenLibraryAdapter(dependencies: Dependencies = {}): CatalogProvider {
  const environment = dependencies.environment ? validateCatalogEnvironment(dependencies.environment) : requireCatalogEnvironment();
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  return {
    id: "open-library" as const,
    async search(request: CatalogSearchRequest, signal: AbortSignal) {
      const url = new URL("/search.json", environment.openLibraryBaseUrl);
      url.searchParams.set(request.mode, request.query);
      url.searchParams.set("lang", "fr");
      url.searchParams.set("limit", "10");
      url.searchParams.set("fields", OPEN_LIBRARY_FIELDS);
      const text = await fetchCatalogDocument(fetchImpl, url, signal, "json", new Set([new URL(environment.openLibraryBaseUrl).origin]));
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" }); }
      if (!payload || typeof payload !== "object" || !Array.isArray((payload as { docs?: unknown }).docs)) {
        throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
      }
      const docs = (payload as { docs: unknown[] }).docs.slice(0, 10);
      const candidates = docs.flatMap((doc) => {
        if (!doc || typeof doc !== "object") return [];
        const data = doc as Record<string, unknown>;
        const sourceId = boundedText(data.key, 256);
        const title = boundedText(data.title);
        if (!sourceId || !title) return [];
        const year = typeof data.first_publish_year === "number" && Number.isSafeInteger(data.first_publish_year) ? String(data.first_publish_year) : undefined;
        const parsedEditions = parseEditions(data.editions);
        const projection = { sourceId, title, authors: boundedStrings(data.author_name), publicationDate: year, editions: parsedEditions };
        const claim = createSourceClaim({ provider: "open-library", sourceId, projection, collectedAt: now().toISOString(), rights: { status: "known", label: "Open Library data", url: "https://openlibrary.org/developers/licensing" } });
        const editions = toEditions(parsedEditions, claim.claimRef);
        return [createNormalizedCandidate({
          primaryClaimRef: claim.claimRef,
          sources: [claim],
          candidateKind: editions.length ? "work-with-editions" : "edition-only",
          title: provenanced(title, claim.claimRef),
          authors: projection.authors.map((value) => provenanced(value, claim.claimRef)),
          ...(year ? { publicationDate: provenanced(year, claim.claimRef) } : {}),
          editions,
        })];
      });
      if (docs.length > 0 && candidates.length === 0) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
      return candidates;
    },
  };
}
