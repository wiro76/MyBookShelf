export default function Loading() {
  return (
    <main className="welcome-shell" aria-busy="true">
      <section className="welcome-card loading-card">
        <p className="eyebrow">My BookShelf</p>
        <p className="loading-label" role="status" aria-live="polite">
          Chargement de My BookShelf…
        </p>
        <div className="loading-line" aria-hidden="true" />
        <div className="loading-line loading-line-short" aria-hidden="true" />
      </section>
    </main>
  );
}
