"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Shelf = "À lire" | "En cours" | "Terminés" | "Coups de cœur";
type Book = {
  id: string;
  title: string;
  author: string;
  cover: string;
  shelf: Shelf;
  owned: number;
  total: number;
  color: string;
};
type SearchBook = {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  edition_count?: number;
};

const SHELVES: Shelf[] = ["À lire", "En cours", "Terminés", "Coups de cœur"];
const COLORS = ["#d95f46", "#35666d", "#d6a643", "#735a7c", "#577247"];

const starterBooks: Book[] = [
  { id: "op-1", title: "One Piece", author: "Eiichirō Oda", cover: "https://covers.openlibrary.org/b/id/10521270-L.jpg", shelf: "En cours", owned: 48, total: 111, color: "#d95f46" },
  { id: "snk-1", title: "L’Attaque des Titans", author: "Hajime Isayama", cover: "https://covers.openlibrary.org/b/id/12658102-L.jpg", shelf: "Terminés", owned: 34, total: 34, color: "#735a7c" },
  { id: "spy-1", title: "Spy × Family", author: "Tatsuya Endō", cover: "https://covers.openlibrary.org/b/id/12648262-L.jpg", shelf: "En cours", owned: 11, total: 14, color: "#35666d" },
  { id: "naus-1", title: "Nausicaä", author: "Hayao Miyazaki", cover: "https://covers.openlibrary.org/b/id/9874751-L.jpg", shelf: "Coups de cœur", owned: 7, total: 7, color: "#577247" },
  { id: "death-1", title: "Death Note", author: "Tsugumi Ōba", cover: "https://covers.openlibrary.org/b/id/10526142-L.jpg", shelf: "Terminés", owned: 12, total: 12, color: "#20262a" },
  { id: "blue-1", title: "Blue Period", author: "Tsubasa Yamaguchi", cover: "https://covers.openlibrary.org/b/id/12653253-L.jpg", shelf: "À lire", owned: 1, total: 15, color: "#d6a643" },
];

function BookCover({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button className="book" onClick={onOpen} aria-label={`Ouvrir ${book.title}`} title={`${book.title} — ${book.author}`}>
      <span className="book-shadow" />
      {!failed && book.cover ? (
        <img src={book.cover} alt={`Couverture de ${book.title}`} onError={() => setFailed(true)} />
      ) : (
        <span className="fallback-cover" style={{ background: book.color }}>
          <small>{book.author}</small><strong>{book.title}</strong><i>manga</i>
        </span>
      )}
      <span className="book-spine" style={{ background: book.color }} />
    </button>
  );
}

export default function Home() {
  const [books, setBooks] = useState<Book[]>(starterBooks);
  const [activeShelf, setActiveShelf] = useState<"Toute la bibliothèque" | Shelf>("Toute la bibliothèque");
  const [sort, setSort] = useState("manual");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Book | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("mon-etalage-books");
    if (saved) {
      try { setBooks(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("mon-etalage-books", JSON.stringify(books));
  }, [books]);

  const visible = useMemo(() => {
    const list = activeShelf === "Toute la bibliothèque" ? books : books.filter((b) => b.shelf === activeShelf);
    if (sort === "az") return [...list].sort((a, b) => a.title.localeCompare(b.title, "fr"));
    if (sort === "author") return [...list].sort((a, b) => a.author.localeCompare(b.author, "fr"));
    if (sort === "progress") return [...list].sort((a, b) => b.owned / b.total - a.owned / a.total);
    return list;
  }, [books, activeShelf, sort]);

  async function searchInternet(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query + " manga")}&limit=8&fields=key,title,author_name,cover_i,first_publish_year,edition_count`);
      const data = await response.json();
      setResults(data.docs ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addResult(item: SearchBook) {
    if (books.some((b) => b.id === item.key)) return;
    setBooks((current) => [...current, {
      id: item.key,
      title: item.title,
      author: item.author_name?.[0] ?? "Auteur inconnu",
      cover: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-L.jpg` : "",
      shelf: "À lire",
      owned: 1,
      total: Math.max(1, Math.min(item.edition_count ?? 1, 99)),
      color: COLORS[current.length % COLORS.length],
    }]);
  }

  function updateSelected(patch: Partial<Book>) {
    if (!selected) return;
    const next = { ...selected, ...patch };
    setSelected(next);
    setBooks((current) => current.map((book) => book.id === next.id ? next : book));
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Mon Étagère, accueil">
          <span className="brand-mark">M</span>
          <span><strong>Mon Étagère</strong><small>Bibliothèque personnelle</small></span>
        </a>
        <nav aria-label="Navigation principale">
          <a className="active" href="#bibliotheque">Ma bibliothèque</a>
          <button onClick={() => setSearchOpen(true)}>Découvrir</button>
        </nav>
        <div className="header-actions">
          <button className="round" aria-label="Rechercher" onClick={() => setSearchOpen(true)}>⌕</button>
          <button className="avatar" aria-label="Profil">ZM</button>
        </div>
      </header>

      <section className="hero" id="bibliotheque">
        <div>
          <p className="eyebrow">BONJOUR ZAN</p>
          <h1>Votre collection,<br /><em>à votre façon.</em></h1>
          <p>Rangez vos mangas, suivez vos séries et redécouvrez les histoires qui vous sont chères.</p>
        </div>
        <div className="hero-stats">
          <div><strong>{books.length}</strong><span>livres</span></div>
          <div><strong>{new Set(books.map((b) => b.title)).size}</strong><span>séries</span></div>
          <div><strong>{books.filter((b) => b.owned >= b.total).length}</strong><span>complétées</span></div>
        </div>
      </section>

      <section className="library-tools">
        <div className="shelf-tabs" role="tablist" aria-label="Catégories">
          {(["Toute la bibliothèque", ...SHELVES] as const).map((shelf) => (
            <button key={shelf} role="tab" aria-selected={activeShelf === shelf} className={activeShelf === shelf ? "selected" : ""} onClick={() => setActiveShelf(shelf)}>
              {shelf}<span>{shelf === "Toute la bibliothèque" ? books.length : books.filter((b) => b.shelf === shelf).length}</span>
            </button>
          ))}
        </div>
        <div className="tool-actions">
          <label>Trier par
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier les livres">
              <option value="manual">Mon ordre</option>
              <option value="az">Titre A–Z</option>
              <option value="author">Auteur A–Z</option>
              <option value="progress">Avancement</option>
            </select>
          </label>
          <button className="add-button" onClick={() => setSearchOpen(true)}><span>＋</span> Ajouter un livre</button>
        </div>
      </section>

      <section className="bookcase" aria-label="Étagère de livres">
        <div className="case-top" />
        {[0, 1].map((row) => {
          const rowBooks = visible.slice(row * 7, row * 7 + 7);
          return (
            <div className="shelf-row" key={row}>
              <div className="books">
                {rowBooks.map((book) => <BookCover key={book.id} book={book} onOpen={() => setSelected(book)} />)}
                {rowBooks.length < 7 && row === Math.floor(Math.max(visible.length - 1, 0) / 7) && (
                  <button className="empty-slot" onClick={() => setSearchOpen(true)} aria-label="Ajouter un livre ici">
                    <span>＋</span><small>Ajouter</small>
                  </button>
                )}
              </div>
              <div className="wood-edge"><span /></div>
            </div>
          );
        })}
        {!visible.length && <div className="empty-state"><strong>Cette étagère attend ses premiers livres.</strong><button onClick={() => setSearchOpen(true)}>En ajouter un</button></div>}
      </section>

      <section className="now-reading">
        <div><p className="eyebrow">EN CE MOMENT</p><h2>Vos lectures en cours</h2></div>
        <div className="progress-list">
          {books.filter((b) => b.shelf === "En cours").slice(0, 3).map((book) => (
            <button key={book.id} onClick={() => setSelected(book)}>
              <img src={book.cover} alt="" />
              <span><strong>{book.title}</strong><small>Tome {book.owned} sur {book.total}</small><i><b style={{ width: `${Math.min(100, book.owned / book.total * 100)}%` }} /></i></span>
              <em>{Math.round(book.owned / book.total * 100)}%</em>
            </button>
          ))}
        </div>
      </section>

      {searchOpen && (
        <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
          <section className="search-panel" role="dialog" aria-modal="true" aria-labelledby="search-title">
            <button className="close" onClick={() => setSearchOpen(false)} aria-label="Fermer">×</button>
            <p className="eyebrow">AGRANDIR VOTRE COLLECTION</p>
            <h2 id="search-title">Quel livre cherchez-vous ?</h2>
            <p>Recherchez un titre, un auteur ou un ISBN. Les couvertures et informations viennent d’Open Library.</p>
            <form onSubmit={searchInternet}>
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex. Frieren, Akira, 978…" aria-label="Titre, auteur ou ISBN" />
              <button type="submit">{searching ? "Recherche…" : "Rechercher"}</button>
            </form>
            <div className="search-results">
              {results.map((item) => {
                const added = books.some((b) => b.id === item.key);
                return (
                  <article key={item.key}>
                    {item.cover_i ? <img src={`https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`} alt="" /> : <div className="result-placeholder">M</div>}
                    <div><strong>{item.title}</strong><small>{item.author_name?.[0] ?? "Auteur inconnu"} · {item.first_publish_year ?? "Date inconnue"}</small></div>
                    <button disabled={added} onClick={() => addResult(item)}>{added ? "Ajouté" : "Ajouter"}</button>
                  </article>
                );
              })}
              {!searching && query && !results.length && <p className="no-results">Lancez la recherche pour voir les résultats.</p>}
            </div>
          </section>
        </div>
      )}

      {selected && (
        <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <section className="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
            <button className="close" onClick={() => setSelected(null)} aria-label="Fermer">×</button>
            <img src={selected.cover} alt={`Couverture de ${selected.title}`} />
            <div>
              <p className="eyebrow">{selected.shelf}</p>
              <h2 id="detail-title">{selected.title}</h2>
              <p className="author">{selected.author}</p>
              <p className="summary">Une fiche personnelle pour suivre votre collection. Les résumés détaillés et la détection automatique de tous les tomes seront enrichis dans la prochaine étape.</p>
              <label>Ranger dans
                <select value={selected.shelf} onChange={(e) => updateSelected({ shelf: e.target.value as Shelf })}>
                  {SHELVES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <div className="volume-control">
                <span><small>Tomes possédés</small><strong>{selected.owned} / {selected.total}</strong></span>
                <button onClick={() => updateSelected({ owned: Math.max(0, selected.owned - 1) })}>−</button>
                <button onClick={() => updateSelected({ owned: Math.min(selected.total, selected.owned + 1) })}>＋</button>
              </div>
              <button className="remove" onClick={() => { setBooks((b) => b.filter((x) => x.id !== selected.id)); setSelected(null); }}>Retirer de ma bibliothèque</button>
            </div>
          </section>
        </div>
      )}

      <footer><span>Mon Étagère</span><p>Votre bibliothèque vous ressemble.</p><small>Données enregistrées sur cet appareil.</small></footer>
    </main>
  );
}
