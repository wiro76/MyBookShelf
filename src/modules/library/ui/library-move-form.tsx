"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { LibraryItem, LibraryShelf } from "../domain/library-foundation";
import type { MoveActionState } from "@/app/bibliotheque/move-actions";

type MoveAction = (state: MoveActionState, formData: FormData) => Promise<MoveActionState>;
export type MoveDropRequest = Readonly<{ sourceItemId: string; shelfId: string; position: number; requestId: number }>;
const initialState: MoveActionState = { status: "idle" };

export function LibraryMoveForm({ item, sourceShelfId, sourceShelf, shelves, action, dropRequest }: Readonly<{ item: LibraryItem; sourceShelfId: string; sourceShelf: LibraryShelf; shelves: readonly LibraryShelf[]; action: MoveAction; dropRequest?: MoveDropRequest | null }>) {
  const commandIdRef = useRef(crypto.randomUUID());
  const commandIdFieldRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [destinationShelfId, setDestinationShelfId] = useState(sourceShelfId);
  const [destinationPosition, setDestinationPosition] = useState(item.itemPosition);
  const previous = [...sourceShelf.items].sort((left, right) => left.itemPosition - right.itemPosition).find((current) => current.itemPosition < item.itemPosition);
  const next = [...sourceShelf.items].sort((left, right) => left.itemPosition - right.itemPosition).find((current) => current.itemPosition > item.itemPosition);

  useEffect(() => {
    if (!dropRequest || dropRequest.sourceItemId !== item.id) return;
    const shelfField = formRef.current?.elements.namedItem("destinationShelfId");
    const positionField = formRef.current?.elements.namedItem("destinationPosition");
    if (!(shelfField instanceof HTMLSelectElement) || !(positionField instanceof HTMLInputElement)) return;
    shelfField.value = dropRequest.shelfId;
    positionField.value = String(dropRequest.position);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }, [dropRequest, item.id]);

  const intentPosition = (position: number) => {
    setDestinationShelfId(sourceShelfId);
    setDestinationPosition(position);
  };

  return (
    <details className="library-move">
      <summary>Déplacer</summary>
      <form ref={formRef} action={formAction} onSubmit={() => { if (commandIdFieldRef.current) commandIdFieldRef.current.value = commandIdRef.current; }}>
        <input ref={commandIdFieldRef} type="hidden" name="commandId" value="" readOnly />
        <input type="hidden" name="placementId" value={item.id} />
        <input type="hidden" name="sourceShelfId" value={sourceShelfId} />
        <input type="hidden" name="expectedVersion" value={item.version ?? 1} />
        <label>Étagère<select name="destinationShelfId" value={destinationShelfId} onChange={(event) => { setDestinationShelfId(event.target.value); setDestinationPosition(0); }}>{shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{statusLabel(shelf.status)} · Étagère {shelf.shelfPosition + 1} · {shelf.occupiedUnits}/{shelf.capacityUnits}</option>)}</select></label>
        <label>Position<input name="destinationPosition" type="number" min="0" value={destinationPosition} onChange={(event) => setDestinationPosition(Number(event.target.value))} /></label>
        <div className="library-move-quick-actions" aria-label="Déplacement relatif">
          <button type="submit" name="moveIntent" value="up" disabled={pending || !previous} onClick={() => intentPosition(previous?.itemPosition ?? item.itemPosition)}>Monter</button>
          <button type="submit" name="moveIntent" value="before" disabled={pending || !previous} onClick={() => intentPosition(previous?.itemPosition ?? item.itemPosition)}>Avant</button>
          <button type="submit" name="moveIntent" value="down" disabled={pending || !next} onClick={() => intentPosition((next?.itemPosition ?? item.itemPosition) + (next?.widthUnits ?? 0))}>Descendre</button>
          <button type="submit" name="moveIntent" value="after" disabled={pending || !next} onClick={() => intentPosition((next?.itemPosition ?? item.itemPosition) + (next?.widthUnits ?? 0))}>Après</button>
        </div>
        <button type="submit" disabled={pending}>{pending ? "Déplacement…" : "Confirmer"}</button>
        <span role="status">{state.status === "conflict" ? "La bibliothèque a changé. Recharge puis réessaie." : state.status === "invalid" ? "Déplacement impossible." : state.status === "confirmed" || state.status === "replayed" ? "Exemplaire déplacé." : null}</span>
      </form>
    </details>
  );
}

const statusLabel = (status: string) => status === "want-to-read" ? "Envie de lire" : status === "reading" ? "En cours" : "Terminés";
