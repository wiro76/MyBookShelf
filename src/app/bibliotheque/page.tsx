import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resumeLibraryContext } from "@/modules/library/application/library-view-state";
import { createPostgresLibraryViewStateRepository } from "@/modules/library/adapters/postgres-library-view-state";
import { LibraryResumeFocus } from "@/modules/library/ui/library-resume-focus";
import { loadPrivateLibrarySummary } from "@/modules/identity/application/private-library";
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

  const [summary, resume] = await Promise.all([
    loadPrivateLibrarySummary(session.user.id),
    // Les tables canoniques de rangement arrivent avec les stories 3.x. Jusqu'alors la
    // projection courante est légitimement vide : aucun faux livre n'est créé pour donner
    // l'illusion d'une reprise. Le port restera identique lorsque cette projection existera.
    resumeLibraryContext(session.user.id, [], createPostgresLibraryViewStateRepository()),
  ]);

  if (!summary || resume.status === "unavailable") {
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
              } t’attendent ici. Tes étagères arriveront dans un prochain incrément.`}
        </p>
        <LibraryResumeFocus
          targetId={resume.status === "empty" ? "titre-bibliotheque" : "library-resume-target"}
          announcement={"announcement" in resume ? resume.announcement : null}
        />
      </section>
    </main>
  );
}
