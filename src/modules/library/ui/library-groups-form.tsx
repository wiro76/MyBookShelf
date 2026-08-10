"use client";

import { useActionState } from "react";
import { useState } from "react";
import type { LibraryItem, LibraryProjection } from "../domain/library-foundation";
import type { GroupActionState } from "@/app/bibliotheque/groups-actions";
import type { ThemeActionState } from "@/app/bibliotheque/groups-actions";
import type { LibraryGroup, LibraryTheme } from "../domain/library-groups";

type Props = Readonly<{
  projection: LibraryProjection;
  action: (state: GroupActionState, formData: FormData) => Promise<GroupActionState>;
  groups: readonly LibraryGroup[];
  themes: readonly LibraryTheme[];
  themeAction: (state: ThemeActionState, formData: FormData) => Promise<ThemeActionState>;
}>;

const initialState: GroupActionState = { status: "idle" };

export function LibraryGroupsForm({ projection, action, groups, themes, themeAction }: Props) {
  const items: readonly LibraryItem[] = projection.statuses.flatMap((entry) => entry.modules.flatMap((module) => module.shelves.flatMap((shelf) => shelf.items)));
  const [state, formAction] = useActionState(action, initialState);
  const [themeState, themeFormAction] = useActionState(themeAction, initialState);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [commandId, setCommandId] = useState(crypto.randomUUID());
  const [themeCommandId] = useState(crypto.randomUUID());
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
      <div className="library-groups-list" aria-live="polite">
        <h3>Groupes enregistrés</h3>
        {groups.length === 0 ? <p className="library-empty-state">Aucun groupe enregistré.</p> : <ul>{groups.map((group) => <li key={group.id}><strong>{group.name}</strong><span>{group.copyIds.length} exemplaire{group.copyIds.length > 1 ? "s" : ""} · {group.statusCounts["want-to-read"] + group.statusCounts["in-progress"] + group.statusCounts.completed} placé{group.statusCounts["want-to-read"] + group.statusCounts["in-progress"] + group.statusCounts.completed > 1 ? "s" : ""}</span></li>)}</ul>}
      </div>
      <div className="library-theme-panel">
        <h3>Créer un repère</h3>
        <form action={themeFormAction} className="library-groups-form">
          <input type="hidden" name="commandId" value={themeCommandId} />
          <label>Nom interne<input name="name" required maxLength={80} /></label>
          <label>Libellé accessible<input name="label" required maxLength={120} placeholder="Ex. À relire" /></label>
          <label>Icône ou motif<input name="icon" maxLength={80} placeholder="Ex. livre" /></label>
          <label>Motif complémentaire<input name="pattern" maxLength={80} placeholder="Ex. points" /></label>
          <label>Couleur facultative<input name="color" type="text" pattern="#[0-9a-fA-F]{6}" placeholder="#C8784A" /></label>
          <button className="primary-action" type="submit">Créer le repère</button>
          {themeState.status === "confirmed" || themeState.status === "replayed" ? <p role="status" className="catalog-selection-status">Repère enregistré. Le libellé reste disponible sans la couleur.</p> : themeState.status === "invalid" ? <p role="status" className="catalog-selection-status">Le repère n’a pas pu être enregistré.</p> : null}
        </form>
        {themes.length > 0 ? <ul className="library-theme-list">{themes.map((theme) => <li key={theme.id}><span className="library-theme-swatch" style={theme.color ? { backgroundColor: theme.color } : undefined} aria-hidden="true" /> <strong>{theme.label}</strong><small>{[theme.icon, theme.pattern].filter(Boolean).join(" · ") || "Repère textuel"}</small></li>)}</ul> : null}
      </div>
    </section>
  );
}
