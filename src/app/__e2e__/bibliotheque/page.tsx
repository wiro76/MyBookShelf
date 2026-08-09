import { notFound } from "next/navigation";
import type { LibraryProjection } from "@/modules/library/domain/library-foundation";
import { LibraryProjection as LibraryProjectionView } from "@/modules/library/ui/library-projection";
import { LibraryResumeFocus } from "@/modules/library/ui/library-resume-focus";

export const dynamic = "force-dynamic";

const fixture: LibraryProjection = {
  statuses: (["want-to-read", "reading", "finished"] as const).map((status) => ({
    status,
    modules: [{
      id: `fixture-module-${status}`,
      status,
      modulePosition: 0,
      capacityUnits: 20,
      shelves: Array.from({ length: 5 }, (_, shelfPosition) => ({
        id: `fixture-shelf-${status}-${shelfPosition}`,
        moduleId: `fixture-module-${status}`,
        status,
        shelfPosition,
        capacityUnits: 20,
        occupiedUnits: status === "reading" && shelfPosition === 0 ? 2 : 0,
        items: status === "reading" && shelfPosition === 0 ? [{
          id: "fixture-placement-1",
          copyId: "fixture-copy-1",
          title: "Le Comte de Monte-Cristo",
          author: "Alexandre Dumas",
          editionTitle: "Édition de démonstration",
          itemPosition: 0,
          widthUnits: 2,
        }] : [],
      })),
    }],
  })),
};

export default function BibliothequeE2EPage() {
  if (process.env.ENABLE_E2E_HARNESS !== "1") notFound();
  return (
    <main className="welcome-shell">
      <section className="welcome-card auth-card" aria-labelledby="library-e2e-title">
        <p className="eyebrow">Harnais E2E</p>
        <h1 id="library-e2e-title" tabIndex={-1}>Bibliothèque physique</h1>
        <p className="intro">Projection de test des trois statuts, sans donnée personnelle.</p>
        <LibraryProjectionView projection={fixture} resumeCopyId="fixture-copy-1" />
        <LibraryResumeFocus targetId="library-resume-target" announcement="La dernière place est ouverte dans la bibliothèque En cours." />
      </section>
    </main>
  );
}
