"use client";

import { useActionState, useRef, useState } from "react";
import type { LibraryItem, LibraryShelf } from "../domain/library-foundation";
import type { MoveSelectionActionState } from "@/app/bibliotheque/move-actions";

type SelectionAction = (state: MoveSelectionActionState, formData: FormData) => Promise<MoveSelectionActionState>;
const initialState: MoveSelectionActionState = { status: "idle" };

export function LibrarySelectionMoveForm({ items, shelves, action, onClear }: Readonly<{ items: readonly LibraryItem[]; shelves: readonly LibraryShelf[]; action: SelectionAction; onClear: () => void }>) {
  const [commandId] = useState(() => crypto.randomUUID());
  const [state, formAction, pending] = useActionState(action, initialState);
  const [shelfId, setShelfId] = useState(shelves[0]?.id ?? "");
  const [position, setPosition] = useState(0);
  const commandIdRef = useRef<HTMLInputElement>(null);
  const versions = Object.fromEntries(items.map((item) => [item.id, item.version ?? 1]));
  return (
    <section className="library-selection" aria-labelledby="library-selection-title">
      <div className="library-selection-heading">
        <strong id="library-selection-title">{items.length} exemplaire{items.length > 1 ? "s" : ""} sélectionné{items.length > 1 ? "s" : ""}</strong>
        <button type="button" className="catalog-secondary-action" onClick={onClear}>Effacer la sélection</button>
      </div>
      <form action={formAction} onSubmit={() => { if (commandIdRef.current) commandIdRef.current.value = commandId; }}>
        <input ref={commandIdRef} type="hidden" name="commandId" value="" readOnly />
        <input type="hidden" name="placementIds" value={JSON.stringify(items.map((item) => item.id))} readOnly />
        <input type="hidden" name="expectedVersions" value={JSON.stringify(versions)} readOnly />
        <label>Déplacer vers<select name="destinationShelfId" value={shelfId} onChange={(event) => setShelfId(event.target.value)}>{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>Étagère {shelf.shelfPosition + 1} · {shelf.occupiedUnits}/{shelf.capacityUnits}</option>)}</select></label>
        <label>Position<input name="destinationPosition" type="number" min="0" value={position} onChange={(event) => setPosition(Number(event.target.value))} /></label>
        <button type="submit" disabled={pending}>{pending ? "Déplacement…" : "Déplacer la sélection"}</button>
        <span role="status">{state.status === "conflict" ? "La sélection a changé. Recharge puis réessaie." : state.status === "invalid" ? "Déplacement impossible pour toute la sélection." : state.status === "confirmed" || state.status === "replayed" ? "Sélection déplacée intégralement." : null}</span>
      </form>
    </section>
  );
}
