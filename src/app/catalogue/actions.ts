"use server";

import { createHash, randomUUID } from "node:crypto";
import { getVerifiedSession } from "@/modules/identity/application/session";
import { createBnfSruAdapter } from "@/modules/catalog/adapters/bnf-sru";
import { createGoogleBooksAdapter } from "@/modules/catalog/adapters/google-books";
import { createOpenLibraryAdapter } from "@/modules/catalog/adapters/open-library";
import { searchCatalog } from "@/modules/catalog/application/search-catalog";
import { createEditionSelectionRef } from "@/modules/catalog/application/edition-selection";
import { createPostgresLibraryWantToReadRepository } from "@/modules/library/adapters/postgres-library-want-to-read";
import { validateAddEditionAsWantToRead } from "@/modules/library/application/library-want-to-read";
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
      selectionRef: createEditionSelectionRef(candidate.candidateRef, edition.editionRef),
      title: edition.title.value,
      ...(edition.publicationDate ? { publicationDate: edition.publicationDate.value } : {}),
      ...(edition.pageCount ? { pageCount: edition.pageCount.value } : {}),
      languages: edition.languages.map(({ value }) => value),
      identifiers: edition.identifiers.map(({ value }) => `${value.scheme.toUpperCase()} ${value.value}`),
      provenance: [...new Set(edition.title.claimRefs.flatMap((claimRef) => candidate.sources.filter((source) => source.claimRef === claimRef).map((source) => source.provider)))],
      coverage: "not-provided" as const,
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

export type AddEditionState = Readonly<{ status: "idle" | "confirmed" | "replayed" | "invalid" | "unavailable"; copyId?: string }>;

export async function ajouterEditionCommeEnvie(previousState: AddEditionState, formData: FormData): Promise<AddEditionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  try {
    const identifiers = JSON.parse(String(formData.get("identifiers") ?? "[]"));
    const provenance = JSON.parse(String(formData.get("provenance") ?? "[]"));
    const input = validateAddEditionAsWantToRead({
      candidateKey: formData.get("candidateKey"),
      editionKey: formData.get("editionKey"),
      workTitle: formData.get("workTitle"),
      editionTitle: formData.get("editionTitle"),
      identifiers,
      provenance,
    });
    const commandId = formData.get("commandId");
    if (typeof commandId !== "string") return { status: "invalid" };
    const receipt = await createPostgresLibraryWantToReadRepository().addEditionAsWantToRead(session.user.id, commandId, input);
    return { status: receipt.status, copyId: receipt.copyId };
  } catch {
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}

export type ManualEditionState = Readonly<{ status: "idle" | "confirmed" | "replayed" | "invalid" | "unavailable"; copyId?: string }>;

export async function creerEditionManuelle(previousState: ManualEditionState, formData: FormData): Promise<ManualEditionState> {
  const session = await getVerifiedSession();
  if (session.status !== "authenticated") return { status: "unavailable" };
  try {
    const title = String(formData.get("workTitle") ?? "").trim();
    const editionTitle = String(formData.get("editionTitle") ?? title).trim();
    const seed = `${title}\u0000${editionTitle}`.normalize("NFKC");
    const digest = createHash("sha256").update(seed).digest("hex");
    const identifiers = String(formData.get("identifiers") ?? "").trim();
    const input = validateAddEditionAsWantToRead({
      candidateKey: `candidate_${digest}`,
      editionKey: `edition-${digest.slice(0, 32)}`,
      workTitle: title,
      editionTitle,
      identifiers: identifiers ? [identifiers] : [],
      provenance: ["manual"],
      ...(String(formData.get("author") ?? "").trim() ? { author: String(formData.get("author")) } : {}),
      ...(String(formData.get("summary") ?? "").trim() ? { summary: String(formData.get("summary")) } : {}),
      ...(String(formData.get("pageCount") ?? "").trim() ? { pageCount: Number(formData.get("pageCount")) } : {}),
      ...(String(formData.get("series") ?? "").trim() ? { series: String(formData.get("series")) } : {}),
      ...(String(formData.get("volume") ?? "").trim() ? { volume: String(formData.get("volume")) } : {}),
      ...(String(formData.get("publicationDate") ?? "").trim() ? { publicationDate: String(formData.get("publicationDate")) } : {}),
      ...(String(formData.get("editionStatement") ?? "").trim() ? { editionStatement: String(formData.get("editionStatement")) } : {}),
    });
    const commandId = formData.get("commandId");
    if (typeof commandId !== "string") return { status: "invalid" };
    const receipt = await createPostgresLibraryWantToReadRepository().addEditionAsWantToRead(session.user.id, commandId, input);
    return { status: receipt.status, copyId: receipt.copyId };
  } catch {
    return previousState.status === "confirmed" ? previousState : { status: "invalid" };
  }
}
