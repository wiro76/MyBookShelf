"use client";

import { useActionState } from "react";
import { importerCouverture, type CoverUploadState } from "./cover-actions";

type CoverTarget = Readonly<{ copyId: string; label: string }>;

export function CoverUpload({ targets }: Readonly<{ targets: readonly CoverTarget[] }>) {
  const [state, action, pending] = useActionState<CoverUploadState, FormData>(importerCouverture, { status: "idle" });
  return (
    <section className="library-cover-upload" aria-labelledby="library-cover-upload-title">
      <h2 id="library-cover-upload-title">Ajouter une couverture personnelle</h2>
      {targets.length > 0 ? (
        <form action={action}>
          <label htmlFor="cover-copy">Exemplaire</label>
          <select id="cover-copy" name="copyId" required defaultValue={targets[0].copyId}>
            {targets.map((target) => <option key={target.copyId} value={target.copyId}>{target.label}</option>)}
          </select>
          <label htmlFor="cover-file">Image</label>
          <input id="cover-file" name="cover" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required />
          <label className="library-cover-rights"><input name="rightsConfirmed" type="checkbox" required /> Je confirme disposer des droits d’utilisation.</label>
          <button className="primary-action" type="submit" disabled={pending}>{pending ? "Préparation…" : "Importer la couverture"}</button>
        </form>
      ) : <p>Aucun exemplaire n’est encore disponible pour une couverture.</p>}
      <p className="library-upload-status" role="status" aria-live="polite">
        {state.status === "confirmed" ? "Couverture importée et associée à l’exemplaire." : state.status === "invalid" ? "La couverture n’a pas pu être importée. Vérifie le fichier et la confirmation des droits." : state.status === "unavailable" ? "Ta session n’est plus disponible. Reconnecte-toi pour importer." : "Les fichiers sont conservés privés et préparés avant affichage."}
      </p>
    </section>
  );
}
