"use client";

import { useActionState, useState } from "react";
import { creerEditionManuelle, type ManualEditionState } from "../actions";

const initialState: ManualEditionState = { status: "idle" };

export function ManualEditionForm() {
  const [commandId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(creerEditionManuelle, initialState);
  return (
    <form className="manual-edition-form" action={action}>
      <input type="hidden" name="commandId" value={commandId} />
      <div className="manual-form-grid">
        <div><label htmlFor="manual-work-title">Titre de l’œuvre *</label><input id="manual-work-title" name="workTitle" required maxLength={500} /></div>
        <div><label htmlFor="manual-edition-title">Mention d’édition</label><input id="manual-edition-title" name="editionTitle" maxLength={500} placeholder="Même titre si vide" /></div>
        <div><label htmlFor="manual-author">Auteur</label><input id="manual-author" name="author" maxLength={500} /></div>
        <div><label htmlFor="manual-isbn">ISBN</label><input id="manual-isbn" name="identifiers" inputMode="numeric" maxLength={200} /></div>
        <div><label htmlFor="manual-pages">Pagination</label><input id="manual-pages" name="pageCount" type="number" min="1" max="100000" /></div>
        <div><label htmlFor="manual-date">Date de publication</label><input id="manual-date" name="publicationDate" maxLength={100} /></div>
        <div><label htmlFor="manual-series">Série</label><input id="manual-series" name="series" maxLength={500} /></div>
        <div><label htmlFor="manual-volume">Tome</label><input id="manual-volume" name="volume" maxLength={100} /></div>
      </div>
      <div><label htmlFor="manual-summary">Résumé</label><textarea id="manual-summary" name="summary" maxLength={10000} rows={4} /></div>
      <p className="catalog-hint">La couverture personnelle validée par la Story 2.5 sera rattachée au prochain passage média. Cette commande crée uniquement l’œuvre, l’édition, l’exemplaire et son placement privé.</p>
      <button className="primary-action" type="submit" disabled={pending || state.status === "confirmed"}>{pending ? "Sauvegarde…" : state.status === "confirmed" || state.status === "replayed" ? "Ajouté comme envie de lire" : "Ajouter comme envie de lire"}</button>
      <p className="catalog-selection-status" role="status" aria-live="polite">{state.status === "invalid" ? "Le titre est requis ou la saisie est invalide. Corrige les champs puis réessaie." : state.status === "unavailable" ? "Ta session n’est plus disponible. Reconnecte-toi puis réessaie." : state.status === "confirmed" || state.status === "replayed" ? "L’édition est maintenant visible dans Envie de lire." : "Les champs marqués d’un astérisque sont requis."}</p>
    </form>
  );
}
