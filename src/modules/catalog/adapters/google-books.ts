import type { CatalogEnvironment } from "@/shared/config/environment";
import { requireCatalogEnvironment, validateCatalogEnvironment } from "@/shared/config/environment";
import type { CatalogProvider, CatalogSearchRequest } from "../application/catalog-provider";
import { createNormalizedCandidate, createSourceClaim, type EditionCandidate } from "../domain/normalized-candidate";
import { boundedDescription, boundedStrings, boundedText, normalizeIsbnIdentifier, provenanced } from "./adapter-types";
import { fetchCatalogDocument } from "./catalog-http";
import { encodeGoogleBooksQuery } from "./query-encoding";

export { encodeGoogleBooksQuery } from "./query-encoding";

const GOOGLE_FIELDS = "totalItems,items(id,volumeInfo(title,subtitle,authors,description,language,publishedDate,industryIdentifiers,pageCount))";

type Dependencies = { fetch?: typeof fetch; now?: () => Date; environment?: CatalogEnvironment };

export function createGoogleBooksAdapter(dependencies: Dependencies = {}): CatalogProvider {
  const environment = dependencies.environment ? validateCatalogEnvironment(dependencies.environment) : requireCatalogEnvironment();
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  return {
    id: "google-books" as const,
    async search(request: CatalogSearchRequest, signal: AbortSignal) {
      const url = new URL("/books/v1/volumes", environment.googleBooksBaseUrl);
      url.searchParams.set("q", encodeGoogleBooksQuery(request.mode, request.query));
      url.searchParams.set("printType", "books");
      url.searchParams.set("projection", "full");
      url.searchParams.set("maxResults", "10");
      url.searchParams.set("fields", GOOGLE_FIELDS);
      if (environment.googleBooksApiKey) url.searchParams.set("key", environment.googleBooksApiKey);
      const text = await fetchCatalogDocument(fetchImpl, url, signal, "json", new Set([new URL(environment.googleBooksBaseUrl).origin]));
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" }); }
      const totalItems = payload && typeof payload === "object" ? (payload as { totalItems?: unknown }).totalItems : undefined;
      const payloadItems = payload && typeof payload === "object" ? (payload as { items?: unknown }).items : undefined;
      if (!payload || typeof payload !== "object" || !Number.isSafeInteger(totalItems) || (totalItems as number) < 0
        || ((totalItems as number) > 0 && !Array.isArray(payloadItems)) || (payloadItems !== undefined && !Array.isArray(payloadItems))) {
        throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
      }
      const items = Array.isArray(payloadItems) ? payloadItems.slice(0, 10) : [];
      if (((totalItems as number) === 0) !== (items.length === 0)) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
      const candidates = items.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const sourceId = boundedText((item as { id?: unknown }).id, 256);
        const volume = (item as { volumeInfo?: unknown }).volumeInfo;
        if (!sourceId || !volume || typeof volume !== "object") return [];
        const data = volume as Record<string, unknown>;
        const title = boundedText(data.title);
        if (!title) return [];
        const identifiers = Array.isArray(data.industryIdentifiers)
          ? data.industryIdentifiers.flatMap((entry) => {
              if (!entry || typeof entry !== "object") return [];
              const normalized = normalizeIsbnIdentifier((entry as { identifier?: unknown }).identifier);
              return normalized ? [normalized] : [];
            }).slice(0, 50) : [];
        const pageCount = typeof data.pageCount === "number" && Number.isSafeInteger(data.pageCount) && data.pageCount > 0 ? data.pageCount : undefined;
        const projection = { sourceId, title, subtitle: boundedText(data.subtitle), authors: boundedStrings(data.authors), description: boundedDescription(data.description), languages: boundedText(data.language) ? [boundedText(data.language)!] : [], publicationDate: boundedText(data.publishedDate, 64), identifiers, pageCount };
        const claim = createSourceClaim({ provider: "google-books", sourceId, projection, collectedAt: now().toISOString(), rights: { status: "unknown" } });
        const edition: EditionCandidate = {
          editionRef: `google-books:${sourceId}`,
          title: provenanced(title, claim.claimRef),
          ...(projection.publicationDate ? { publicationDate: provenanced(projection.publicationDate, claim.claimRef) } : {}),
          ...(pageCount ? { pageCount: provenanced(pageCount, claim.claimRef) } : {}),
          languages: projection.languages.map((value) => provenanced(value, claim.claimRef)),
          identifiers: identifiers.map((value) => provenanced(value, claim.claimRef)),
        };
        return [createNormalizedCandidate({
          primaryClaimRef: claim.claimRef,
          sources: [claim],
          candidateKind: "edition-only",
          title: provenanced(title, claim.claimRef),
          ...(projection.subtitle ? { subtitle: provenanced(projection.subtitle, claim.claimRef) } : {}),
          authors: projection.authors.map((value) => provenanced(value, claim.claimRef)),
          ...(projection.description ? { description: provenanced(projection.description, claim.claimRef) } : {}),
          languages: projection.languages.map((value) => provenanced(value, claim.claimRef)),
          ...(projection.publicationDate ? { publicationDate: provenanced(projection.publicationDate, claim.claimRef) } : {}),
          identifiers: identifiers.map((value) => provenanced(value, claim.claimRef)),
          editions: [edition],
        })];
      });
      if (items.length > 0 && candidates.length === 0) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
      return candidates;
    },
  };
}
