import type { LibraryProjection } from "../domain/library-foundation";

type LibraryProjectionProps = Readonly<{
  projection: LibraryProjection;
  resumeCopyId?: string | null;
}>;

const statusLabel = (status: string) => status === "want-to-read" ? "Envie de lire" : status === "reading" ? "En cours" : "Terminés";

export function LibraryProjection({ projection, resumeCopyId = null }: LibraryProjectionProps) {
  return (
    <div className="library-status-grid">
      {projection.statuses.map((entry) => (
        <section className="library-status-section" key={entry.status} aria-labelledby={`library-status-${entry.status}`}>
          <h3 id={`library-status-${entry.status}`}>{statusLabel(entry.status)}</h3>
          {entry.modules.map((module) => (
            <div className="library-module" key={module.id}>
              <strong>Module {module.modulePosition + 1}</strong>
              <ul aria-label={`Étagères du module ${module.modulePosition + 1}`}>
                {module.shelves.map((shelf) => (
                  <li key={shelf.id} className="library-shelf">
                    <div className="library-shelf-heading">
                      <span>Étagère {shelf.shelfPosition + 1}</span>
                      <span>{shelf.occupiedUnits} / {shelf.capacityUnits} unités</span>
                    </div>
                    {shelf.items.length > 0 ? (
                      <ol tabIndex={0} className="library-items" aria-label={`Exemplaires de l’étagère ${shelf.shelfPosition + 1}`}>
                        {shelf.items.map((item) => (
                          <li key={item.id} id={item.copyId === resumeCopyId ? "library-resume-target" : undefined} tabIndex={-1} className="library-item" aria-label={`${item.title}${item.author ? `, ${item.author}` : ""}, position ${item.itemPosition + 1}`}>
                            <span className="library-spine" aria-hidden="true" style={{ width: `${Math.max(2.5, item.widthUnits * 0.3)}rem` }} />
                            <span className="library-item-copy">
                              <strong>{item.title}</strong>
                              <small>{item.author ?? item.editionTitle}</small>
                            </span>
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
          <div className="library-actions">
            <a className="primary-action" href="/catalogue">Rechercher dans le Catalogue</a>
            <a className="catalog-secondary-action" href="/catalogue/ajout-manuel">Ajouter manuellement</a>
          </div>
        </section>
      ))}
    </div>
  );
}
