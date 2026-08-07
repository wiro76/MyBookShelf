"use server";

import { randomUUID } from "node:crypto";
import { getVerifiedSession } from "@/modules/identity/application/session";
import { createBnfSruAdapter } from "@/modules/catalog/adapters/bnf-sru";
import { createGoogleBooksAdapter } from "@/modules/catalog/adapters/google-books";
import { createOpenLibraryAdapter } from "@/modules/catalog/adapters/open-library";
import { searchCatalog } from "@/modules/catalog/application/search-catalog";
import type { NormalizedCandidate } from "@/modules/catalog/domain/normalized-candidate";
import type { CatalogueSearchState } from "./state";

function toPresentationCandidate(candidate: NormalizedCandidate) {
  return {
    candidateRef: candidate.candidateRef,
    title: candidate.title.value,
    ...(candidate.subtitle ? { subtitle: candidate.subtitle.value } : {}),
    authors: candidate.authors.map(({ value }) => value),
    ...(candidate.description ? { description: candidate.description.value } : {}),
    languages: candidate.languages.map(({ value }) => value),
    ...(candidate.publicationDate ? { publicationDate: candidate.publicationDate.value } : {}),
    identifiers: candidate.identifiers.map(({ value }) => `${value.scheme.toUpperCase()} ${value.value}`),
    editions: candidate.editions.map((edition) => ({
      title: edition.title.value,
      ...(edition.publicationDate ? { publicationDate: edition.publicationDate.value } : {}),
      ...(edition.pageCount ? { pageCount: edition.pageCount.value } : {}),
      languages: edition.languages.map(({ value }) => value),
      identifiers: edition.identifiers.map(({ value }) => `${value.scheme.toUpperCase()} ${value.value}`),
    })),
    primaryProvider: candidate.primaryClaim.provider,
    providers: [...new Set(candidate.sources.map(({ provider }) => provider))],
  } as const;
}

export async function rechercherCatalogue(
  previousState: CatalogueSearchState,
  formData: FormData,
): Promise<CatalogueSearchState> {
  const attempt = Number.isSafeInteger(previousState?.attempt) && previousState.attempt >= 0 ? previousState.attempt + 1 : 1;
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") {
    return { attempt, sessionUnavailable: session.status === "unavailable", sessionAnonymous: session.status === "anonymous" };
  }

  const mode = formData.get("mode");
  const query = formData.get("query");
  const outcome = await searchCatalog(
    {
      mode: mode === "author" ? "author" : mode === "title" ? "title" : (mode as never),
      query: typeof query === "string" ? query : "",
    },
    {
      correlationId: randomUUID(),
      providers: [createGoogleBooksAdapter(), createOpenLibraryAdapter(), createBnfSruAdapter()],
    },
  );

  return {
    attempt,
    sessionUnavailable: false,
    outcome: outcome.status === "invalid"
      ? { status: "invalid" }
      : { status: outcome.status, query: outcome.query, mode: outcome.mode, candidates: outcome.candidates.map(toPresentationCandidate) },
  };
}
