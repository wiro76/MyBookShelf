import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadPrivateLibrarySummary } from "@/modules/identity/application/private-library";
import { PRIVATE_LIBRARY_REDIRECT } from "@/modules/identity/application/redirect-allowlist";
import { getVerifiedUser } from "@/modules/identity/application/session";

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
  const user = await getVerifiedUser();

  if (!user) {
    // La destination transmise est une CONSTANTE du code, jamais une valeur reçue : rien
    // d'externe ne transite par cette redirection.
    redirect(`/connexion?destination=${encodeURIComponent(PRIVATE_LIBRARY_REDIRECT)}`);
  }

  const summary = await loadPrivateLibrarySummary(user.id);

  return (
    <main className="welcome-shell">
      <section className="welcome-card auth-card" aria-labelledby="titre-bibliotheque">
        <p className="eyebrow">My BookShelf</p>
        <h1 id="titre-bibliotheque">Ta bibliothèque</h1>
        {summary ? (
          <>
            <p className="intro">
              {summary.displayName
                ? `Te voilà, ${summary.displayName}. Cet espace n’est visible que par toi.`
                : "Te voilà. Cet espace n’est visible que par toi."}
            </p>
            <p className="project-status">
              {summary.noteCount === 0
                ? "Aucune note privée pour l’instant. Tes étagères arrivent dans un prochain incrément."
                : `${summary.noteCount} note${summary.noteCount > 1 ? "s" : ""} privée${
                    summary.noteCount > 1 ? "s" : ""
                  } t’attendent ici. Tes étagères arrivent dans un prochain incrément.`}
            </p>
          </>
        ) : (
          // État dégradé, jamais une page vide : une bibliothèque affichée vide se lirait
          // comme une bibliothèque effacée.
          <p className="intro" role="status">
            Tes livres n’ont pas pu être lus pour le moment. Recharge la page dans un instant.
          </p>
        )}
      </section>
    </main>
  );
}
