import { notFound } from "next/navigation";
import type { LibraryProjection } from "@/modules/library/domain/library-foundation";
import { LibraryProjection as LibraryProjectionView } from "@/modules/library/ui/library-projection";
import { LibraryResumeFocus } from "@/modules/library/ui/library-resume-focus";

export const dynamic = "force-dynamic";

const createFixture = (growth: boolean): LibraryProjection => ({
  statuses: (["want-to-read", "reading", "finished"] as const).map((status) => ({
    status,
    modules: Array.from({ length: growth && status === "reading" ? 5 : 1 }, (_, modulePosition) => ({
      id: `fixture-module-${status}-${modulePosition}`,
      status,
      modulePosition,
      capacityUnits: 20,
      shelves: Array.from({ length: 5 }, (_, shelfPosition) => {
        const load = growth && status === "reading" ? Array.from({ length: 4 }, (_, itemIndex) => ({
          id: `fixture-placement-${modulePosition}-${shelfPosition}-${itemIndex}`,
          copyId: `fixture-copy-${modulePosition}-${shelfPosition}-${itemIndex}`,
          title: `Livre ${modulePosition * 20 + shelfPosition * 4 + itemIndex + 1}`,
          author: "Auteur de démonstration",
          editionTitle: "Édition de charge",
          itemPosition: itemIndex * 5,
          widthUnits: 5,
        })) : status === "reading" && shelfPosition === 0 ? [{
          id: "fixture-placement-1", copyId: "fixture-copy-1", title: "Le Comte de Monte-Cristo", author: "Alexandre Dumas", editionTitle: "Édition de démonstration", itemPosition: 0, widthUnits: 2,
        }, {
          id: "fixture-placement-2", copyId: "fixture-copy-2", title: "Notre-Dame de Paris", author: "Victor Hugo", editionTitle: "Édition de démonstration", itemPosition: 2, widthUnits: 2,
        }] : [];
        return {
          id: `fixture-shelf-${status}-${modulePosition}-${shelfPosition}`,
          moduleId: `fixture-module-${status}-${modulePosition}`,
          status,
          shelfPosition,
          capacityUnits: 20,
          occupiedUnits: load.reduce((total, item) => total + item.widthUnits, 0),
          items: load,
        };
      }),
    })),
  })),
});

export default function BibliothequeE2EPage({ growth = false }: { growth?: boolean }) {
  if (process.env.ENABLE_E2E_HARNESS !== "1") notFound();
  const fixture = createFixture(growth);
  return (
    <main className="welcome-shell">
      <section className="welcome-card auth-card" aria-labelledby="library-e2e-title">
        <p className="eyebrow">Harnais E2E</p>
        <h1 id="library-e2e-title" tabIndex={-1}>Bibliothèque physique</h1>
        <p className="intro">Projection de test des trois statuts, sans donnée personnelle.</p>
        <LibraryProjectionView projection={fixture} resumeCopyId={growth ? null : "fixture-copy-1"} />
        {growth ? null : <LibraryResumeFocus targetId="library-resume-target" announcement="La dernière place est ouverte dans la bibliothèque En cours." />}
      </section>
    </main>
  );
}
