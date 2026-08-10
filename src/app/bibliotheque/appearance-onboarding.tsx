"use client";

import { useActionState, useState } from "react";
import { FREE_APPEARANCE_OPTIONS, type AppearancePreference } from "@/modules/library/domain/library-appearance";
import { enregistrerApparence, type AppearanceActionState } from "./appearance-actions";

const INITIAL_STATE: AppearanceActionState = { status: "idle" };

export function AppearanceOnboarding({ initialPreference }: { initialPreference: AppearancePreference | null }) {
  const [preference, setPreference] = useState<AppearancePreference | null>(initialPreference);
  const [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const [cancelled, setCancelled] = useState(false);
  const [savedPreference] = useState<AppearancePreference | null>(initialPreference);
  const [state, action, pending] = useActionState(enregistrerApparence, INITIAL_STATE);

  const update = (part: keyof AppearancePreference, value: string) => {
    setPreference((current) => ({ structureId: current?.structureId ?? "frame", finishId: current?.finishId ?? "oak", [part]: value }));
    setCommandId(crypto.randomUUID());
    setCancelled(false);
  };
  const confirmed = state.status === "confirmed";
  const effectiveSavedPreference = confirmed && state.structureId && state.finishId
    ? { structureId: state.structureId, finishId: state.finishId }
    : savedPreference;
  const cancel = () => { setPreference(effectiveSavedPreference); setCancelled(true); };
  const draft = state.status === "invalid" || state.status === "unavailable" ? effectiveSavedPreference : preference;
  const preview = draft ?? { structureId: "frame", finishId: "oak" };
  const dirty = !effectiveSavedPreference || !draft || draft.structureId !== effectiveSavedPreference.structureId || draft.finishId !== effectiveSavedPreference.finishId;

  return (
    <section className="appearance-configurator" aria-labelledby="appearance-title">
      <div className="appearance-configurator-heading">
        <div><p className="project-kicker">Personnalisation gratuite</p><h2 id="appearance-title">Choisir l’apparence du meuble</h2></div>
        <span className="project-badge project-badge-in-progress">Aperçu</span>
      </div>
      <p className="project-status">Prévisualise une structure et une finition. Ton rangement et tes exemplaires restent inchangés.</p>
      <div className="appearance-preview" data-structure={preview.structureId} data-finish={preview.finishId} data-selected={draft ? "true" : "false"} role="img" aria-label={draft ? `Aperçu : ${FREE_APPEARANCE_OPTIONS.structures.find((option) => option.id === preview.structureId)?.label}, ${FREE_APPEARANCE_OPTIONS.finishes.find((option) => option.id === preview.finishId)?.label}` : "Aperçu de l’apparence à choisir"}>
        <span className="appearance-preview-shelf" /><span className="appearance-preview-shelf" /><span className="appearance-preview-shelf" />
      </div>
      <form action={action}><input type="hidden" name="commandId" value={commandId} />
        <fieldset className="appearance-options">
          <legend>Structure</legend>
          {FREE_APPEARANCE_OPTIONS.structures.map((option) => <label className={`appearance-option${preference?.structureId === option.id ? " is-selected" : ""}`} key={option.id}><input type="radio" name="structureId" value={option.id} checked={preference?.structureId === option.id} onChange={() => update("structureId", option.id)} disabled={pending} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
        </fieldset>
        <fieldset className="appearance-options">
          <legend>Finition</legend>
          {FREE_APPEARANCE_OPTIONS.finishes.map((option) => <label className={`appearance-option${preference?.finishId === option.id ? " is-selected" : ""}`} key={option.id}><input type="radio" name="finishId" value={option.id} checked={preference?.finishId === option.id} onChange={() => update("finishId", option.id)} disabled={pending} /><span><i className="appearance-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" /><strong>{option.label}</strong></span></label>)}
        </fieldset>
        <div className="appearance-actions"><button className="catalog-secondary-action" type="button" onClick={cancel} disabled={pending}>Annuler</button><button className="primary-action" type="submit" disabled={pending || !draft}>{pending ? "Enregistrement…" : !dirty && confirmed ? "Apparence enregistrée" : "Confirmer l’apparence"}</button></div>
      </form>
      <p className="appearance-status" role="status" aria-live="polite">{cancelled ? "Les modifications ont été annulées. L’apparence enregistrée est restaurée." : state.status === "unavailable" ? "Ta session n’est plus disponible. Reconnecte-toi pour enregistrer." : state.status === "invalid" ? "Cette apparence n’a pas pu être enregistrée. Ton rangement reste intact." : confirmed && !dirty ? "L’apparence est enregistrée. Aucun exemplaire n’a été déplacé." : savedPreference ? "Tu peux prévisualiser une autre apparence puis l’annuler." : "Choisis une structure et une finition pour commencer."}</p>
    </section>
  );
}
