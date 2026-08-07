import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resumeLibraryContext } from "@/modules/library/application/library-view-state";
import { createPostgresLibraryViewStateRepository } from "@/modules/library/adapters/postgres-library-view-state";
import { LibraryResumeFocus } from "@/modules/library/ui/library-resume-focus";
import { loadPrivateLibrarySummary } from "@/modules/identity/application/private-library";
import { createPostgresLibraryFoundationRepository } from "@/modules/library/adapters/postgres-library-foundation";
import { PRIVATE_LIBRARY_REDIRECT } from "@/modules/identity/application/redirect-allowlist";
import { getVerifiedSession } from "@/modules/identity/application/session";

/**
 * Route privée témoin — story 1.6 (AC 1, AC 2, AC 4 ; CAP-1, AD-10).
 *
 * Elle prouve la chaîne complète, dans cet ordre et sans raccourci :
 *   1. cookie httpOnly → `supabase.auth.getUser()`, **vérifié côté serveur** ;
 *   2. sans utilisateur vérifié : **aucune donnée privée n'est rendue**, redirection vers
 *      `/connexion` en conservant la destination validée ;
 *   3. avec utilisateur vérifié : lecture par `authenticatedTransaction`, donc sous
 *      `set local role authenticated` et `request.jwt.claim.sub`, donc RLS appliquée.
 *
 * ⚠️ La garde précède TOUTE lecture. Charger d'abord puis masquer à l'affichage rendrait la
 * donnée présente dans la charge envoyée au navigateur : ce ne serait pas « aucune donnée
 * privée rendue », ce serait « une donnée privée invisible à l'œil ».
 *
 * ⚠️ Non mise en cache, explicitement : `force-dynamic` interdit tout prérendu et toute
 * réutilisation entre requêtes, `revalidate = 0` interdit la revalidation incrémentale, et
 * `fetchCache = "force-no-store"` empêche qu'un `fetch` interne soit mémorisé. Une page
 * privée mise en cache, c'est la bibliothèque de quelqu'un servie à quelqu'un d'autre.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Ta bibliothèque — My BookShelf",
  robots: { index: false, follow: false },
};

export default async function BibliothequePage() {
  const session = await getVerifiedSession();

  if (session.status === "anonymous") {
    // La destination transmise est une CONSTANTE du code, jamais une valeur reçue : rien
    // d'externe ne transite par cette redirection.
    redirect(`/connexion?destination=${encodeURIComponent(PRIVATE_LIBRARY_REDIRECT)}`);
  }

  if (session.status === "unavailable") {
    return (
      <main className="welcome-shell">
        <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
          <p className="eyebrow">My BookShelf</p>
          <h1 id="titre-bibliotheque">Ta bibliothèque</h1>
          <div role="status">
            <p className="intro">
              Ta session n’a pas pu être vérifiée pour le moment. Tes données restent privées. Réessaie dans un instant.
            </p>
            <a className="primary-action" href="/bibliotheque">
              Réessayer
            </a>
          </div>
        </section>
      </main>
    );
  }

  const foundation = createPostgresLibraryFoundationRepository();
  const [summary, ensured] = await Promise.all([
    loadPrivateLibrarySummary(session.user.id),
    foundation.ensure(session.user.id).then(() => true).catch(() => false),
  ]);

  if (!ensured) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
          <p className="eyebrow">My BookShelf</p>
          <h1 id="titre-bibliotheque">Ta bibliothèque</h1>
          <div role="status">
            <p className="intro">Ta bibliothèque n’a pas pu reprendre sa dernière position ni initialiser sa structure réelle. Tes données restent privées.</p>
            <a className="primary-action" href="/bibliotheque">Réessayer</a>
          </div>
        </section>
      </main>
    );
  }

  let projection;
  let resume;
  try {
    [projection, resume] = await Promise.all([
      foundation.load(session.user.id),
      resumeLibraryContext(session.user.id, [], createPostgresLibraryViewStateRepository()),
    ]);
  } catch {
    return (
      <main className="welcome-shell">
        <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
          <p className="eyebrow">My BookShelf</p>
          <h1 id="titre-bibliotheque">Ta bibliothèque</h1>
          <div role="status"><p className="intro">La projection réelle de ta bibliothèque n’a pas pu être chargée. Tes données restent privées.</p><a className="primary-action" href="/bibliotheque">Réessayer</a></div>
        </section>
      </main>
    );
  }

  if (resume.status === "unavailable") {
    return (
      <main className="welcome-shell">
        <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
          <p className="eyebrow">My BookShelf</p>
          <h1 id="titre-bibliotheque">Ta bibliothèque</h1>
          <div role="status">
            <p className="intro">
              Ta bibliothèque n’a pas pu reprendre sa dernière position. Tes livres restent privés. Réessaie dans un instant.
            </p>
            <a className="primary-action" href="/bibliotheque">
              Réessayer
            </a>
          </div>
        </section>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
          <p className="eyebrow">My BookShelf</p>
          <h1 id="titre-bibliotheque">Ta bibliothèque</h1>
          <div role="status">
            <p className="intro">
              Ta bibliothèque n’a pas pu être chargée. Tes données restent privées. Réessaie dans un instant.
            </p>
            <a className="primary-action" href="/bibliotheque">
              Réessayer
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="welcome-shell">
      <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
        <p className="eyebrow">My BookShelf</p>
        <h1 id="titre-bibliotheque" tabIndex={-1}>Ta bibliothèque</h1>
        <p className="intro">
          {summary.displayName
            ? `Te voilà, ${summary.displayName}. Cet espace n’est visible que par toi.`
            : "Te voilà. Cet espace n’est visible que par toi."}
        </p>
        <p className="project-status">
          {summary.noteCount === 0
            ? "Ta bibliothèque est prête. Tes étagères arriveront dans un prochain incrément."
            : `${summary.noteCount} note${summary.noteCount > 1 ? "s" : ""} privée${
                summary.noteCount > 1 ? "s" : ""
              } t’attendent ici.`}
        </p>
        <section className="library-foundation" aria-labelledby="library-foundation-title">
          <h2 id="library-foundation-title">Ton rangement réel</h2>
          <p className="project-status">Chaque statut possède maintenant son module et ses étagères persistants. La projection ci-dessous reflète uniquement les exemplaires réellement placés.</p>
          <div className="library-status-grid">
            {projection.statuses.map((entry) => {
              const label = entry.status === "want-to-read" ? "Envie de lire" : entry.status === "reading" ? "En cours" : "Terminés";
              return (
                <section className="library-status-section" key={entry.status} aria-labelledby={`library-status-${entry.status}`}>
                  <h3 id={`library-status-${entry.status}`}>{label}</h3>
                  {entry.modules.map((module) => (
                    <div className="library-module" key={module.id}>
                      <strong>Module {module.modulePosition + 1}</strong>
                      <ul aria-label={`Étagères du module ${module.modulePosition + 1}`}>
                        {module.shelves.map((shelf) => <li key={shelf.id}>Étagère {shelf.shelfPosition + 1}<span>{shelf.occupiedUnits} / {shelf.capacityUnits} unités</span></li>)}
                      </ul>
                    </div>
                  ))}
                  <p className="library-empty-state">{entry.modules.some((module) => module.shelves.some((shelf) => shelf.occupiedUnits > 0)) ? "Les exemplaires placés sont comptabilisés sur leurs étagères." : "Aucun exemplaire placé dans ce statut."}</p>
                  <div className="library-actions">
                    <a className="primary-action" href="/catalogue">Rechercher dans le Catalogue</a>
                    <a className="catalog-secondary-action" href="/catalogue/ajout-manuel">Ajouter manuellement</a>
                  </div>
                </section>
              );
            })}
          </div>
        </section>
        <nav className="library-actions" aria-label="Actions de la bibliothèque">
          <a className="primary-action" href="/catalogue">
            Rechercher dans le Catalogue
          </a>
        </nav>
        <LibraryResumeFocus
          targetId={resume.status === "empty" ? "titre-bibliotheque" : "library-resume-target"}
          announcement={"announcement" in resume ? resume.announcement : null}
        />
      </section>
    </main>
  );
}
