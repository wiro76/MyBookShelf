export default function Home() {
  return (
    <main className="welcome-shell">
      <section className="welcome-card" aria-labelledby="welcome-title">
        <p className="eyebrow">Ta bibliothèque personnelle</p>
        <h1 id="welcome-title">My BookShelf</h1>
        <p className="intro">
          Un espace calme pour retrouver, organiser et contempler les livres qui comptent pour toi.
        </p>
        <a className="primary-action" href="#etat-du-projet">
          Voir l’état du projet
        </a>
        <p id="etat-du-projet" className="project-status" tabIndex={-1}>
          Le socle est prêt. La connexion privée arrive dans un prochain incrément.
        </p>
      </section>
    </main>
  );
}
