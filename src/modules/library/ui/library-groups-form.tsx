"use client";

import { useActionState } from "react";
import { useState } from "react";
import type { LibraryItem } from "../domain/library-foundation";
import type { GroupActionState } from "@/app/bibliotheque/groups-actions";

type Props = Readonly<{
  items: readonly LibraryItem[];
  action: (state: GroupActionState, formData: FormData) => Promise<GroupActionState>;
}>;

const initialState: GroupActionState = { status: "idle" };

export function LibraryGroupsForm({ items, action }: Props) {
  const [state, formAction] = useActionState(action, initialState);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [commandId, setCommandId] = useState(crypto.randomUUID());
  const toggle = (copyId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(copyId)) next.delete(copyId); else next.add(copyId);
    return next;
  });
  const status = state.status === "confirmed" || state.status === "replayed"
    ? "Groupe enregistré. Les placements restent inchangés."
    : state.status === "invalid" ? "Le groupe n’a pas pu être enregistré. Vérifie son nom et sa sélection."
      : state.status === "unavailable" ? "La session n’est plus disponible."
        : state.status === "conflict" ? "Cette commande a déjà été utilisée avec d’autres données."
          : null;
  return (
    <section className="library-groups-panel" aria-labelledby="library-groups-title">
      <h2 id="library-groups-title">Groupes et repères</h2>
      <p className="project-status">Crée un groupe transversal sans modifier la place des livres.</p>
      <form action={formAction} className="library-groups-form">
        <input type="hidden" name="commandId" value={commandId} />
        <label>Nom du groupe<input name="name" required maxLength={120} placeholder="Ex. Saga à relire" /></label>
        <fieldset>
          <legend>Exemplaires du groupe</legend>
          <div className="library-group-copy-list">
            {items.map((item) => (
              <label key={item.id} className="library-group-copy-option">
                <input type="checkbox" name="copyId" value={item.copyId} checked={selected.has(item.copyId)} onChange={() => toggle(item.copyId)} />
                <span><strong>{item.title}</strong><small>{item.author ?? item.editionTitle}</small></span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary-action" type="submit" disabled={selected.size === 0}>Créer le groupe</button>
        {status ? <p role="status" className="catalog-selection-status">{status}</p> : null}
      </form>
      {(state.status === "confirmed" || state.status === "replayed") ? <button type="button" className="catalog-secondary-action" onClick={() => { setSelected(new Set()); setCommandId(crypto.randomUUID()); }}>Préparer un autre groupe</button> : null}
    </section>
  );
}
