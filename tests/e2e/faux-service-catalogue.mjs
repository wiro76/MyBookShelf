import { createServer } from "node:http";

const PORT = Number(process.env.FAUX_CATALOGUE_PORT ?? 3102);

const json = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const xml = (response, status, body) => {
  response.writeHead(status, { "content-type": "application/xml; charset=utf-8" });
  response.end(body);
};

const googleResult = {
  totalItems: 1,
  items: [
    {
      id: "google-comte-1",
      volumeInfo: {
        title: "Le Comte de Monte-Cristo",
        authors: ["Alexandre Dumas"],
        publishedDate: "2024-05-02",
        description: "Une édition de référence du roman.",
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9782070405374" }],
        language: "fr",
        pageCount: 1488,
      },
      accessInfo: { country: "FR" },
    },
  ],
};

const openLibraryResult = {
  numFound: 1,
  start: 0,
  docs: [
    {
      key: "/works/OL-MONTE-1W",
      title: "Le Comte de Monte-Cristo",
      author_name: ["Alexandre Dumas"],
      first_publish_year: 1844,
      editions: {
        numFound: 1,
        start: 0,
        docs: [
          {
            key: "/books/OL-MONTE-1M",
            title: "Le Comte de Monte-Cristo",
            publish_date: ["2024"],
            number_of_pages_median: 1488,
            language: ["fre"],
            isbn: ["9782070405374"],
          },
        ],
      },
    },
  ],
};

const bnfResult = `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <srw:numberOfRecords>1</srw:numberOfRecords>
  <srw:records><srw:record><srw:recordData><dc:dc>
    <dc:identifier>ark:/12148/cb-monte-1</dc:identifier>
    <dc:title>Le Comte de Monte-Cristo</dc:title>
    <dc:creator>Alexandre Dumas</dc:creator>
    <dc:date>2024</dc:date>
    <dc:language>fre</dc:language>
    <dc:identifier>9782070405374</dc:identifier>
    <dc:description>Notice bibliographique BnF.</dc:description>
  </dc:dc></srw:recordData></srw:record></srw:records>
</srw:searchRetrieveResponse>`;

const bnfEmpty = `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/"><srw:numberOfRecords>0</srw:numberOfRecords><srw:records /></srw:searchRetrieveResponse>`;

let calls = [];

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/sante") return json(response, 200, { ok: true, calls });
  if (url.pathname === "/reset") {
    calls = [];
    return json(response, 200, { ok: true });
  }

  const provider = url.pathname.includes("volumes")
    ? "google-books"
    : url.pathname.includes("search.json")
      ? "open-library"
      : url.pathname.toLowerCase().includes("sru")
        ? "bnf"
        : "unknown";
  const query = [...url.searchParams.values()].join(" ").toLocaleLowerCase("fr");
  calls.push({ provider, pathname: url.pathname });

  if (provider === "unknown") return json(response, 404, { error: "route inconnue" });
  if (query.includes("indisponible")) return json(response, 503, { error: "texte fournisseur interdit" });
  if (query.includes("lent")) await new Promise((resolve) => setTimeout(resolve, 4_000));
  if (query.includes("partiel") && provider === "open-library") {
    return json(response, 503, { error: "texte fournisseur interdit" });
  }

  const empty = query.includes("introuvable") || query.includes("partiel");
  if (provider === "google-books") return json(response, 200, empty ? { totalItems: 0, items: [] } : googleResult);
  if (provider === "open-library") return json(response, 200, empty ? { numFound: 0, docs: [] } : openLibraryResult);
  return xml(response, 200, empty ? bnfEmpty : bnfResult);
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`Faux Catalogue prêt sur ${PORT}\n`);
});
