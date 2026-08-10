import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CATALOG_REDIRECT } from "@/modules/identity/application/redirect-allowlist";
import { getVerifiedSession } from "@/modules/identity/application/session";
import { CatalogueSearch } from "./catalogue-search";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = { title: "Catalogue — My BookShelf", robots: { index: false, follow: false } };

export default async function CataloguePage() {
  const session = await getVerifiedSession();
  if (session.status === "anonymous") redirect(`/connexion?destination=${encodeURIComponent(CATALOG_REDIRECT)}`);
  if (session.status === "unavailable") {
    return <main className="catalog-shell"><section aria-labelledby="catalog-title"><p className="eyebrow">My BookShelf</p><h1 id="catalog-title">Catalogue</h1><div className="catalog-notice" role="status"><p>Ta session n’a pas pu être vérifiée. Aucun fournisseur n’a été appelé.</p><a className="primary-action" href="/catalogue">Réessayer</a></div></section></main>;
  }
  return (
    <main className="catalog-shell">
      <header className="catalog-header"><div><p className="eyebrow">My BookShelf</p><h1>Catalogue</h1><p>Trouve une œuvre sans modifier ta bibliothèque.</p></div><a className="catalog-back" href="/bibliotheque">Retour à la bibliothèque</a></header>
      <CatalogueSearch />
    </main>
  );
}
