import type { Metadata } from "next";
import { AUTH_LABELS } from "@/modules/identity/application/messages";
import { resolveRedirectDestination } from "@/modules/identity/application/redirect-allowlist";
import { ConnexionForm } from "./connexion-form";

/**
 * Écran de connexion — story 1.6 (AC 1, AC 3).
 *
 * Surface autonome centrée : **pas de `navigation-principale`**. Celle-ci ne sert qu'à
 * basculer entre les trois bibliothèques, ce qui est inutilisable sans session — l'afficher
 * ici proposerait des destinations qui refuseraient toutes. On réutilise la structure
 * `.welcome-shell` / `.welcome-card` de la page d'accueil, rayon 16px conservé : c'est un
 * panneau, pas un contrôle.
 *
 * ⚠️ Non mise en cache, explicitement. La page dépend de `searchParams` et sa réponse pose,
 * dans le cas nominal, un cookie de session : une version mise en cache par un CDN servirait
 * la destination — et, à terme, le `Set-Cookie` — d'une personne à une autre.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Connexion — My BookShelf",
  description: "Connecte-toi pour ouvrir ta bibliothèque privée.",
  robots: { index: false, follow: false },
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Première validation. La valeur brute n'est ni affichée, ni journalisée, ni transmise
  // ailleurs : `resolveRedirectDestination` ne rend jamais que `/` ou `/bibliotheque`.
  // La Server Action revalidera à la soumission — ce champ repart par le client.
  const destination = resolveRedirectDestination(params.destination);

  return (
    <main className="welcome-shell">
      <section className="welcome-card auth-card" aria-labelledby="titre-connexion">
        <p className="eyebrow">{AUTH_LABELS.eyebrow}</p>
        <h1 id="titre-connexion">{AUTH_LABELS.title}</h1>
        <p className="intro">{AUTH_LABELS.intro}</p>
        <ConnexionForm destination={destination} />
      </section>
    </main>
  );
}
