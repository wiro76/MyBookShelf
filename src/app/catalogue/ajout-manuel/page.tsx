import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { normalizeCatalogSearchRequest } from "@/modules/catalog/application/search-catalog";
import { CATALOG_REDIRECT } from "@/modules/identity/application/redirect-allowlist";
import { getVerifiedSession } from "@/modules/identity/application/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const metadata: Metadata = { title: "Ajout manuel — My BookShelf", robots: { index: false, follow: false } };

export default async function AjoutManuelPage({ searchParams }: { searchParams: Promise<{ mode?: string; q?: string }> }) {
  const session = await getVerifiedSession();
  if (session.status === "anonymous") redirect(`/connexion?destination=${encodeURIComponent(CATALOG_REDIRECT)}`);
  if (session.status === "unavailable") return <main className="catalog-shell"><h1>Ajout manuel</h1><p className="catalog-notice" role="status">Ta session n’a pas pu être vérifiée. Réessaie depuis le Catalogue.</p></main>;
  const raw = await searchParams;
  const request = normalizeCatalogSearchRequest({ mode: raw.mode === "author" ? "author" : "title", query: raw.q ?? "" });
  return (
    <main className="catalog-shell">
      <header className="catalog-header"><div><p className="eyebrow">My BookShelf</p><h1>Ajout manuel</h1></div><a className="catalog-back" href="/catalogue">Retour au Catalogue</a></header>
      <section className="catalog-detail" aria-labelledby="manual-title"><h2 id="manual-title">Préparation</h2><p>La création manuelle sera disponible avec la Story 2.6. Aucune donnée n’est enregistrée ici.</p><dl className="catalog-detail-list"><dt>Mode</dt><dd>{request?.mode === "author" ? "Auteur" : "Titre"}</dd><dt>Recherche</dt><dd>{request?.query || "Non renseignée"}</dd></dl></section>
    </main>
  );
}
