export default function Home() {
  return (
    <main className="welcome-shell">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">Ta bibliothèque personnelle</p>
        <h1 id="welcome-title">My BookShelf</h1>
        <p className="intro">
          Un espace calme pour retrouver, organiser et contempler les livres qui comptent pour toi.
        </p>
        <nav aria-label="Parcours principaux" className="home-actions">
          <a className="primary-action" href="/connexion?destination=%2Fbibliotheque">Se connecter</a>
          <a className="catalog-secondary-action" href="/catalogue">Ouvrir le Catalogue</a>
          <a className="catalog-secondary-action" href="/bibliotheque">Voir ma bibliothèque</a>
          <a className="catalog-secondary-action" href="/etat-du-projet">Voir l’état du projet</a>
        </nav>
        <p id="etat-du-projet" className="project-status" tabIndex={-1}>
          Le socle privé, le Catalogue et l’ajout d’éditions sont disponibles pour test.
        </p>
      </section>
    </main>
  );
}
