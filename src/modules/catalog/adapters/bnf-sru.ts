import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { CatalogEnvironment } from "@/shared/config/environment";
import { requireCatalogEnvironment, validateCatalogEnvironment } from "@/shared/config/environment";
import type { CatalogProvider, CatalogSearchRequest } from "../application/catalog-provider";
import { createNormalizedCandidate, createSourceClaim } from "../domain/normalized-candidate";
import { boundedStrings, boundedText, normalizeIsbnIdentifier, provenanced } from "./adapter-types";
import { fetchCatalogDocument } from "./catalog-http";
import { encodeBnfCql } from "./query-encoding";

export { encodeBnfCql } from "./query-encoding";

type Dependencies = { fetch?: typeof fetch; now?: () => Date; environment?: CatalogEnvironment };
const asArray = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

function assertXmlBounds(value: unknown, depth = 0, counter = { nodes: 0 }) {
  counter.nodes += 1;
  if (counter.nodes > 10_000 || depth > 32) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  if (value && typeof value === "object") for (const child of Object.values(value)) assertXmlBounds(child, depth + 1, counter);
}

function findValues(value: unknown, key: string, result: unknown[] = []): unknown[] {
  if (!value || typeof value !== "object") return result;
  for (const [entryKey, child] of Object.entries(value)) {
    if (entryKey === key) result.push(...asArray(child));
    else findValues(child, key, result);
  }
  return result;
}

function parseBnfXml(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  if (XMLValidator.validate(xml) !== true) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  let parsed: unknown;
  try {
    parsed = new XMLParser({ removeNSPrefix: true, processEntities: false, htmlEntities: false, ignoreAttributes: true, parseTagValue: false, trimValues: true }).parse(xml);
  } catch {
    throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  }
  assertXmlBounds(parsed);
  if (!parsed || typeof parsed !== "object" || !("searchRetrieveResponse" in parsed)) {
    throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  }
  const response = (parsed as { searchRetrieveResponse: unknown }).searchRetrieveResponse;
  if (!response || typeof response !== "object" || findValues(response, "diagnostics").length > 0) {
    throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  }
  const countValue = findValues(response, "numberOfRecords")[0];
  const count = typeof countValue === "string" && /^\d+$/u.test(countValue) ? Number(countValue) : Number.NaN;
  const records = findValues(response, "recordData");
  if (!Number.isSafeInteger(count) || count < 0 || ((count === 0) !== (records.length === 0))) {
    throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
  }
  return records;
}

export function createBnfSruAdapter(dependencies: Dependencies = {}): CatalogProvider {
  const environment = dependencies.environment ? validateCatalogEnvironment(dependencies.environment) : requireCatalogEnvironment();
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  return {
    id: "bnf" as const,
    async search(request: CatalogSearchRequest, signal: AbortSignal) {
      const url = new URL("/api/SRU", environment.bnfBaseUrl);
      url.searchParams.set("version", "1.2");
      url.searchParams.set("operation", "searchRetrieve");
      url.searchParams.set("query", encodeBnfCql(request.mode, request.query));
      url.searchParams.set("recordSchema", "dublincore");
      url.searchParams.set("maximumRecords", "10");
      const xml = await fetchCatalogDocument(fetchImpl, url, signal, "xml", new Set([new URL(environment.bnfBaseUrl).origin]));
      const records = parseBnfXml(xml).slice(0, 10);
      const candidates = records.flatMap((recordData) => {
        const wrappedRecord = recordData && typeof recordData === "object" && "record" in recordData ? (recordData as { record: unknown }).record : recordData;
        const root = wrappedRecord && typeof wrappedRecord === "object" && "dc" in wrappedRecord ? (wrappedRecord as { dc: unknown }).dc : wrappedRecord;
        if (!root || typeof root !== "object") return [];
        const data = root as Record<string, unknown>;
        const identifiers = asArray(data.identifier).map((item) => boundedText(item, 256)).filter((item): item is string => Boolean(item));
        const sourceId = identifiers.find((item) => /^ark:/i.test(item)) ?? identifiers[0];
        const title = asArray(data.title).map((item) => boundedText(item)).find(Boolean);
        if (!sourceId || !title) return [];
        const normalizedIdentifiers = identifiers.filter((item) => /isbn/i.test(item) || /^[\dXx -]{10,17}$/.test(item)).map(normalizeIsbnIdentifier).filter((item) => item !== undefined);
        const description = asArray(data.description).map((item) => boundedText(item, 10_000)).find((item): item is string => Boolean(item));
        const projection = { sourceId, title, authors: boundedStrings(asArray(data.creator)), description, languages: boundedStrings(asArray(data.language)), publicationDate: asArray(data.date).map((item) => boundedText(item, 64)).find((item): item is string => Boolean(item)), identifiers: normalizedIdentifiers };
        const claim = createSourceClaim({ provider: "bnf", sourceId, projection, collectedAt: now().toISOString(), rights: { status: "known", label: "Licence ouverte Etalab", url: "https://api.bnf.fr/fr/conditions-dutilisation" } });
        return [createNormalizedCandidate({
          primaryClaimRef: claim.claimRef,
          sources: [claim],
          candidateKind: "edition-only",
          title: provenanced(title, claim.claimRef),
          authors: projection.authors.map((value) => provenanced(value, claim.claimRef)),
          ...(description ? { description: provenanced(description, claim.claimRef) } : {}),
          languages: projection.languages.map((value) => provenanced(value, claim.claimRef)),
          ...(projection.publicationDate ? { publicationDate: provenanced(projection.publicationDate, claim.claimRef) } : {}),
          identifiers: normalizedIdentifiers.map((value) => provenanced(value, claim.claimRef)),
          editions: [],
        })];
      });
      if (records.length > 0 && candidates.length === 0) throw Object.assign(new Error("CATALOG_RESPONSE_INVALID"), { code: "CATALOG_RESPONSE_INVALID" });
      return candidates;
    },
  };
}
