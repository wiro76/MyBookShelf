"use client";

import { useActionState, useState } from "react";
import type { LibraryItem, LibraryShelf } from "../domain/library-foundation";
import type { MoveActionState } from "@/app/bibliotheque/move-actions";

type MoveAction = (state: MoveActionState, formData: FormData) => Promise<MoveActionState>;
const initialState: MoveActionState = { status: "idle" };

export function LibraryMoveForm({ item, shelves, action }: Readonly<{ item: LibraryItem; shelves: readonly LibraryShelf[]; action: MoveAction }>) {
  const [commandId] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <details className="library-move">
      <summary>Déplacer</summary>
      <form action={formAction}>
        <input type="hidden" name="commandId" value={commandId} />
        <input type="hidden" name="placementId" value={item.id} />
        <input type="hidden" name="expectedVersion" value={item.version ?? 1} />
        <label>Étagère<select name="destinationShelfId" defaultValue={shelves[0]?.id}>{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>Étagère {shelf.shelfPosition + 1} · {shelf.occupiedUnits}/{shelf.capacityUnits}</option>)}</select></label>
        <label>Position<input name="destinationPosition" type="number" min="0" defaultValue={item.itemPosition} /></label>
        <button type="submit" disabled={pending}>{pending ? "Déplacement…" : "Confirmer"}</button>
        <span role="status">{state.status === "conflict" ? "La bibliothèque a changé. Recharge puis réessaie." : state.status === "invalid" ? "Déplacement impossible." : state.status === "confirmed" || state.status === "replayed" ? "Exemplaire déplacé." : null}</span>
      </form>
    </details>
  );
}
