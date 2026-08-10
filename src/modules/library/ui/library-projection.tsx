"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { LibraryProjection } from "../domain/library-foundation";
import { LibraryMoveForm, type MoveDropRequest } from "./library-move-form";
import { LibrarySelectionMoveForm } from "./library-selection-move-form";
import type { MoveSelectionActionState } from "@/app/bibliotheque/move-actions";
import type { MoveActionState } from "@/app/bibliotheque/move-actions";

type LibraryProjectionProps = Readonly<{
  projection: LibraryProjection;
  resumeTargetId?: string | null;
  moveAction?: (state: MoveActionState, formData: FormData) => Promise<MoveActionState>;
  selectionMoveAction?: (state: MoveSelectionActionState, formData: FormData) => Promise<MoveSelectionActionState>;
  selectionUndoAction?: (state: MoveSelectionActionState, formData: FormData) => Promise<MoveSelectionActionState>;
}>;

const statusLabel = (status: string) => status === "want-to-read" ? "Envie de lire" : status === "reading" ? "En cours" : "Terminés";

function navigateProjection(event: KeyboardEvent<HTMLElement>) {
  const key = event.key;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(key)) return;
  const root = event.currentTarget.closest<HTMLElement>("#library-projection") ?? event.currentTarget;
  const current = (event.target as HTMLElement).closest<HTMLElement>(".library-item, .library-items");
  if (!current) return;
  const currentShelf = current.closest<HTMLElement>(".library-shelf");
  if (!currentShelf) return;
  const items = () => Array.from(currentShelf.querySelectorAll<HTMLElement>(".library-item"));
  const focus = (element: HTMLElement | null | undefined) => {
    if (!element) return;
    event.preventDefault();
    element.focus();
  };
  const currentItems = items();
  const currentIndex = currentItems.indexOf(current);
  if (key === "ArrowLeft") return focus(currentItems[currentIndex - 1]);
  if (key === "ArrowRight") return focus(currentItems[currentIndex + 1]);
  if (key === "Home") return focus(currentItems[0]);
  if (key === "End") return focus(currentItems.at(-1));

  const shelves = Array.from(root.querySelectorAll<HTMLElement>(".library-shelf"));
  const shelfIndex = shelves.indexOf(currentShelf);
  if (key === "ArrowUp" || key === "ArrowDown") {
    const nextShelf = shelves[shelfIndex + (key === "ArrowUp" ? -1 : 1)];
    return focus(nextShelf?.querySelector<HTMLElement>(".library-item") ?? nextShelf?.querySelector<HTMLElement>(".library-items") ?? nextShelf);
  }

  const modules = Array.from(root.querySelectorAll<HTMLElement>(".library-module"));
  const currentModule = currentShelf.closest<HTMLElement>(".library-module");
  const moduleIndex = currentModule ? modules.indexOf(currentModule) : -1;
  const nextModule = modules[moduleIndex + (key === "PageUp" ? -1 : 1)];
  return focus(nextModule?.querySelector<HTMLElement>(".library-item") ?? nextModule?.querySelector<HTMLElement>(".library-items"));
}

export function LibraryProjection({ projection, resumeTargetId = null, moveAction, selectionMoveAction, selectionUndoAction }: LibraryProjectionProps) {
  const shelves = projection.statuses.flatMap((entry) => entry.modules.flatMap((module) => module.shelves));
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropRequest, setDropRequest] = useState<MoveDropRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const dropSequence = useRef(0);
  const requestDrop = (event: DragEvent<HTMLElement>, shelfId: string, position: number) => {
    event.preventDefault();
    const sourceItemId = event.dataTransfer.getData("text/plain") || draggedItemId;
    if (!sourceItemId) return;
    dropSequence.current += 1;
    setDropRequest({ sourceItemId, shelfId, position, requestId: dropSequence.current });
    setDraggedItemId(null);
  };
  const selectedItems = shelves.flatMap((shelf) => shelf.items.filter((item) => selectedIds.has(item.id)));
  return (
    <div id="library-projection" onKeyDownCapture={navigateProjection} aria-label="Projection des bibliothèques">
      {selectionMoveAction && selectedItems.length > 0 ? <LibrarySelectionMoveForm items={selectedItems} shelves={shelves} action={selectionMoveAction} undoAction={selectionUndoAction} onClear={() => setSelectedIds(new Set())} /> : null}
      <div className="library-status-grid">
      {projection.statuses.map((entry) => (
        <section className="library-status-section" key={entry.status} aria-labelledby={`library-status-${entry.status}`}>
          <h3 id={`library-status-${entry.status}`}>{statusLabel(entry.status)}</h3>
          {entry.modules.map((module) => (
            <div className="library-module" key={module.id} aria-label={`Module ${module.modulePosition + 1}`}>
              <strong>Module {module.modulePosition + 1}</strong>
              <ul aria-label={`Étagères du module ${module.modulePosition + 1}`}>
                {module.shelves.map((shelf) => (
                  <li key={shelf.id} tabIndex={shelf.items.length === 0 ? 0 : undefined} className="library-shelf" onDragOver={(event) => event.preventDefault()} onDrop={(event) => requestDrop(event, shelf.id, shelf.occupiedUnits)}>
                    <div className="library-shelf-heading">
                      <span>Étagère {shelf.shelfPosition + 1}</span>
                      <span>{shelf.occupiedUnits} / {shelf.capacityUnits} unités</span>
                    </div>
                    {shelf.items.length > 0 ? (
                      <ol tabIndex={0} className="library-items" aria-label={`Exemplaires de l’étagère ${shelf.shelfPosition + 1}`}>
                        {shelf.items.map((item) => (
                          <li key={item.id} id={item.copyId === resumeTargetId ? "library-resume-target" : undefined} tabIndex={-1} draggable={Boolean(moveAction)} onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.effectAllowed = "move"; setDraggedItemId(item.id); }} onDragEnd={() => setDraggedItemId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); const before = event.clientX < rect.left + rect.width / 2; requestDrop(event, shelf.id, before ? item.itemPosition : item.itemPosition + item.widthUnits); }} className={`library-item${selectionMoveAction ? " has-selection-control" : ""}${draggedItemId === item.id ? " is-dragging" : ""}`} aria-label={`${item.title}${item.author ? `, ${item.author}` : ""}, position ${item.itemPosition + 1}`}>
                            {item.coverStatus === "available" && item.coverUrl ? (
                              <img className="library-cover" src={item.coverUrl} alt={`Couverture de ${item.title}`} />
                            ) : (
                              <span className="library-cover" aria-label="Couverture non fournie">—</span>
                            )}
                            <span className="library-spine" aria-hidden="true" style={{ width: `${Math.max(2.5, item.widthUnits * 0.3)}rem` }} />
                            {selectionMoveAction ? <input className="library-item-select" type="checkbox" checked={selectedIds.has(item.id)} onChange={(event) => setSelectedIds((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} aria-label={`Sélectionner ${item.title}`} /> : null}
                            <span className="library-item-copy">
                              <strong>{item.title}</strong>
                              <small>{item.author ?? item.editionTitle}</small>
                            </span>
                            {moveAction ? <LibraryMoveForm item={item} sourceShelfId={shelf.id} sourceShelf={shelf} shelves={shelves} action={moveAction} dropRequest={dropRequest} /> : null}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="library-empty-state">{entry.modules.some((module) => module.shelves.some((shelf) => shelf.occupiedUnits > 0)) ? "Les exemplaires placés sont comptabilisés sur leurs étagères." : "Aucun exemplaire placé dans ce statut."}</p>
        </section>
      ))}
      </div>
    </div>
  );
}
