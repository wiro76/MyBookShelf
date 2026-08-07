"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ajouterEditionCommeEnvie, rechercherCatalogue } from "./actions";
import { CATALOGUE_INITIAL_STATE, type CatalogueCandidate } from "./state";

const PROVIDERS = {
  "google-books": "Google Books",
  "open-library": "Open Library",
  bnf: "BnF",
} as const;

function manualHref(mode: "title" | "author", query: string) {
  const params = new URLSearchParams({ mode, q: query });
  return `/catalogue/ajout-manuel?${params.toString()}`;
}

function EditionComparison({ candidate }: { candidate: CatalogueCandidate }) {
  const [selectedEditionRef, setSelectedEditionRef] = useState<string>();
  const [commandId] = useState(() => crypto.randomUUID());
  const [addState, addAction, addPending] = useActionState(ajouterEditionCommeEnvie, { status: "idle" as const });
  const selectedEdition = candidate.editions.find((edition) => edition.selectionRef === selectedEditionRef);

  return (
    <section className="edition-comparison" aria-labelledby="edition-comparison-title">
      <h3 id="edition-comparison-title">Comparer et choisir une édition</h3>
      <p className="catalog-hint">La sélection est locale à cette fiche. Elle prépare la prochaine étape. Rien n’a été ajouté à ta bibliothèque.</p>
      <fieldset className="edition-selector">
        <legend className="sr-only">Éditions disponibles pour {candidate.title}</legend>
        <div className="edition-selector-grid">
          {candidate.editions.map((edition) => {
            const selected = selectedEditionRef === edition.selectionRef;
            return (
              <label className={`edition-option${selected ? " is-selected" : ""}`} key={edition.selectionRef}>
                <input
                  type="radio"
                  name={`edition-${candidate.candidateRef}`}
                  value={edition.selectionRef}
                  checked={selected}
                  onChange={() => setSelectedEditionRef(edition.selectionRef)}
                />
                <span className="edition-option-body">
                  <strong>{edition.title}</strong>
                  <span className="edition-cover" aria-label={edition.coverage === "available" ? "Couverture disponible" : "Couverture non fournie"}>
                    {edition.coverage === "available" ? "Couverture disponible" : "Couverture non fournie"}
                  </span>
                  <span><b>ISBN</b> {edition.identifiers.join(", ") || "Non renseigné"}</span>
                  <span><b>Pagination</b> {edition.pageCount ? `${edition.pageCount} pages` : "Non renseignée"}</span>
                  <span><b>Date</b> {edition.publicationDate ?? "Non renseignée"}</span>
                  <span><b>Provenance</b> {edition.provenance.map((provider) => PROVIDERS[provider]).join(", ") || "Non renseignée"}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {selectedEdition ? <form className="edition-add-form" action={addAction}>
        <input type="hidden" name="commandId" value={commandId} />
        <input type="hidden" name="candidateKey" value={candidate.candidateRef} />
        <input type="hidden" name="editionKey" value={selectedEdition.selectionRef} />
        <input type="hidden" name="workTitle" value={candidate.title} />
        <input type="hidden" name="editionTitle" value={selectedEdition.title} />
        <input type="hidden" name="identifiers" value={JSON.stringify(selectedEdition.identifiers)} />
        <input type="hidden" name="provenance" value={JSON.stringify(selectedEdition.provenance)} />
        <button className="primary-action" type="submit" disabled={addPending || addState.status === "confirmed"}>{addPending ? "Ajout…" : addState.status === "confirmed" ? "Ajouté comme envie de lire" : "Ajouter comme envie de lire"}</button>
      </form> : null}
      <p className="catalog-selection-status" role="status" aria-live="polite" data-selected-edition-ref={selectedEdition?.selectionRef}>
        {addState.status === "unavailable" ? "Ta session n’est plus disponible. Reconnecte-toi pour ajouter cette édition." : addState.status === "invalid" ? "L’ajout n’a pas pu être confirmé. Vérifie la sélection puis réessaie." : addState.status === "confirmed" || addState.status === "replayed" ? "L’édition est maintenant visible dans Envie de lire." : selectedEdition ? `Édition sélectionnée : ${selectedEdition.title}.` : "Aucune édition sélectionnée."}
      </p>
    </section>
  );
}

function CandidateDetail({ candidate, activation }: { candidate: CatalogueCandidate; activation: number }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), [candidate.candidateRef, activation]);
  return (
    <section className="catalog-detail" aria-labelledby="catalog-detail-title">
      <p className="eyebrow">Fiche non enregistrée</p>
      <h2 id="catalog-detail-title" ref={titleRef} tabIndex={-1}>{candidate.title}</h2>
      {candidate.subtitle ? <p>{candidate.subtitle}</p> : null}
      <dl className="catalog-detail-list">
        <dt>Auteurs</dt><dd>{candidate.authors.join(", ") || "Non renseigné"}</dd>
        <dt>Description</dt><dd>{candidate.description ?? "Non renseignée"}</dd>
        <dt>Langues</dt><dd>{candidate.languages.join(", ") || "Non renseignées"}</dd>
        <dt>Date</dt><dd>{candidate.publicationDate ?? "Non renseignée"}</dd>
        <dt>Identifiants</dt><dd>{candidate.identifiers.join(", ") || "Non renseignés"}</dd>
        <dt>Éditions repérées</dt><dd>{candidate.editions.length}</dd>
        <dt>Provenance</dt><dd>{candidate.providers.map((provider) => PROVIDERS[provider]).join(", ")}</dd>
      </dl>
      {candidate.editions.length ? <EditionComparison key={candidate.candidateRef} candidate={candidate} /> : <p className="catalog-hint">Aucune édition exploitable n’est fournie par les sources. Rien n’a été ajouté à ta bibliothèque.</p>}
    </section>
  );
}

export function CatalogueSearch() {
  const [state, formAction, pending] = useActionState(rechercherCatalogue, CATALOGUE_INITIAL_STATE);
  const [mode, setMode] = useState<"title" | "author">("title");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{ attempt: number; candidateRef: string; activation: number }>();
  const outcome = state.outcome;
  const candidates = outcome && outcome.status !== "invalid" ? outcome.candidates : [];
  const selectedRef = selection?.attempt === state.attempt ? selection.candidateRef : undefined;
  const selected = candidates.find((candidate) => candidate.candidateRef === selectedRef);
  const retainedMode = outcome && outcome.status !== "invalid" ? outcome.mode : mode;
  const retainedQuery = outcome && outcome.status !== "invalid" ? outcome.query : query;

  return (
    <>
      <form id="catalog-search-form" className="catalog-search-form" action={formAction} noValidate>
        <div className="catalog-search-fields">
          <fieldset className="catalog-mode">
            <legend>Rechercher par</legend>
            <label><input type="radio" name="mode" value="title" checked={mode === "title"} onChange={() => setMode("title")} />Titre</label>
            <label><input type="radio" name="mode" value="author" checked={mode === "author"} onChange={() => setMode("author")} />Auteur</label>
          </fieldset>
          <div className="catalog-query-row">
            <div>
              <label htmlFor="catalog-query">{mode === "title" ? "Titre de l’œuvre" : "Nom de l’auteur"}</label>
              <input id="catalog-query" className="catalog-query" name="query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} aria-describedby={outcome?.status === "invalid" ? "catalog-query-error" : undefined} aria-invalid={outcome?.status === "invalid"} disabled={pending} />
            </div>
            <button className="primary-action" type="submit" disabled={pending}>{pending ? "Recherche…" : "Rechercher"}</button>
          </div>
        </div>
        {outcome?.status === "invalid" ? <p id="catalog-query-error" className="catalog-notice" role="alert">Saisis entre 1 et 200 caractères.</p> : null}
      </form>

      <div className="catalog-notice" role="status" aria-live="polite" key={state.attempt}>
        {pending ? "Recherche du Catalogue en cours." : null}
        {state.sessionUnavailable ? "Ta session n’a pas pu être vérifiée. Aucun fournisseur n’a été appelé." : null}
        {state.sessionAnonymous ? <>Ta session a expiré. <a href="/connexion?destination=%2Fcatalogue">Reconnecte-toi</a> pour rechercher.</> : null}
        {!pending && outcome?.status === "complete" ? `${candidates.length} résultat${candidates.length > 1 ? "s" : ""}.` : null}
        {!pending && outcome?.status === "partial" ? `Résultats partiels : ${candidates.length} candidat${candidates.length > 1 ? "s" : ""}. Certaines sources sont indisponibles.` : null}
        {!pending && outcome?.status === "empty" ? "Aucun résultat dans les trois sources." : null}
        {!pending && outcome?.status === "unavailable" ? "Le Catalogue est indisponible pour le moment." : null}
      </div>

      {outcome && outcome.status !== "invalid" ? (
        <div className="catalog-actions">
          {(outcome.status === "partial" || outcome.status === "unavailable") ? <form action={formAction}><input type="hidden" name="mode" value={retainedMode} /><input type="hidden" name="query" value={retainedQuery} /><button className="catalog-secondary-action" type="submit" disabled={pending}>Réessayer</button></form> : null}
          {(outcome.status === "empty" || outcome.status === "partial" || outcome.status === "unavailable") ? <a className="catalog-secondary-action" href={manualHref(retainedMode, retainedQuery)}>Préparer un ajout manuel</a> : null}
        </div>
      ) : null}

      {candidates.length ? (
        <div className="catalog-layout">
          <section className="catalog-results" aria-labelledby="catalog-results-title">
            <h2 id="catalog-results-title">Résultats</h2>
            <ul className="catalog-results-list">
              {candidates.map((candidate) => (
                <li key={candidate.candidateRef}>
                  <button className="catalog-result-button" type="button" aria-current={selectedRef === candidate.candidateRef} onClick={() => setSelection((current) => ({ attempt: state.attempt, candidateRef: candidate.candidateRef, activation: (current?.activation ?? 0) + 1 }))}>
                    <strong>{candidate.title}</strong>
                    <span>{candidate.authors.join(", ") || "Auteur non renseigné"}</span>
                    <span className="catalog-result-meta">{candidate.publicationDate ?? "Date inconnue"} · {PROVIDERS[candidate.primaryProvider]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selected ? <CandidateDetail candidate={selected} activation={selection?.activation ?? 0} /> : <section className="catalog-detail" aria-label="Détail du résultat"><p>Sélectionne un résultat pour consulter sa fiche.</p></section>}
        </div>
      ) : null}
    </>
  );
}
