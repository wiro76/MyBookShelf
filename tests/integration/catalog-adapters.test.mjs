import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "CATALOG_ADAPTERS_TYPE_STRIPPING";
const fileExists = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;
    if (specifier.startsWith("@/")) candidate = resolve(ROOT, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (candidate) {
      for (const path of [candidate, `${candidate}.ts`, resolve(candidate, "index.ts")]) {
        if (fileExists(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    }
    return nextLoad(url, context);
  },
});

let modules = null;
try {
  const [google, openLibrary, bnf, http, environment] = await Promise.all([
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/adapters/google-books.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/adapters/open-library.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/adapters/bnf-sru.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/adapters/catalog-http.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/shared/config/environment.ts")).href),
  ]);
  modules = { google, openLibrary, bnf, http, environment };
} catch (error) {
  const strippingError = error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension "\.ts"/.test(String(error?.message ?? ""));
  if (process.env[RELAUNCH] || !strippingError) throw error;
  const env = { ...process.env, [RELAUNCH]: "1" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], { stdio: "inherit", env });
  process.exitCode = child.status ?? 1;
}

const jsonResponse = (body, init = {}) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  ...init,
});
const catalogEnvironment = (overrides = {}) => ({
  googleBooksBaseUrl: "https://www.googleapis.com",
  openLibraryBaseUrl: "https://openlibrary.org",
  bnfBaseUrl: "https://catalogue.bnf.fr",
  enableE2eHarness: false,
  ...overrides,
});

if (modules) {
  const { createGoogleBooksAdapter, encodeGoogleBooksQuery } = modules.google;
  const { createOpenLibraryAdapter } = modules.openLibrary;
  const { createBnfSruAdapter, encodeBnfCql } = modules.bnf;
  const { CatalogHttpError, readBoundedCatalogResponse } = modules.http;
  const { readCatalogEnvironment, requireCatalogEnvironment } = modules.environment;

  test("les encodeurs enferment les opérateurs et caractères hostiles dans un unique critère", () => {
    const hostile = String.raw`title:foo" and bib.author any "*" \\ or not`;
    const google = encodeGoogleBooksQuery("title", hostile);
    const bnf = encodeBnfCql("author", hostile);
    assert.match(google, /^intitle:"/);
    assert.equal((google.match(/intitle:/g) ?? []).length, 1);
    assert.match(google, /\\"/);
    assert.match(bnf, /^bib\.author all "/);
    assert.equal((bnf.match(/bib\.author all/g) ?? []).length, 1);
    assert.match(bnf, /\\"/);
    assert.doesNotMatch(google, /[\u0000-\u001f\u007f]/);
    assert.doesNotMatch(bnf, /[\u0000-\u001f\u007f]/);
  });

  test("Google Books construit une requête fermée et retourne des candidats bornés", async () => {
    let requested;
    const adapter = createGoogleBooksAdapter({
      now: () => new Date("2026-08-07T10:00:00.000Z"),
      fetch: async (url, init) => {
        requested = { url: new URL(url), init };
        return jsonResponse({ totalItems: 1, items: [{ id: "g-1", volumeInfo: {
          title: "Le livre",
          subtitle: "Sous-titre",
          authors: ["Auteure"],
          description: "Description",
          language: "fr",
          publishedDate: "2024-01-02",
          industryIdentifiers: [{ type: "ISBN_13", identifier: "9780306406157" }],
          pageCount: 220,
        } }] });
      },
      environment: catalogEnvironment({ googleBooksApiKey: "server-key" }),
    });
    const result = await adapter.search({ mode: "title", query: "Le livre" }, new AbortController().signal);
    assert.equal(requested.url.origin, "https://www.googleapis.com");
    assert.equal(requested.url.pathname, "/books/v1/volumes");
    assert.equal(requested.url.searchParams.get("printType"), "books");
    assert.equal(requested.url.searchParams.get("projection"), "full");
    assert.equal(requested.url.searchParams.get("maxResults"), "10");
    assert.match(requested.url.searchParams.get("fields"), /^totalItems,items\(id,volumeInfo\(/);
    assert.equal(requested.url.searchParams.get("key"), "server-key");
    assert.equal(requested.init.redirect, "manual");
    assert.equal(result.length, 1);
    assert.equal(result[0].primaryClaim.provider, "google-books");
    assert.equal(result[0].primaryClaim.sourceId, "g-1");
    assert.equal(result[0].title.value, "Le livre");
    assert.deepEqual(result[0].identifiers[0].value, { scheme: "isbn-13", value: "9780306406157" });
    assert.equal("raw" in result[0], false);
  });

  test("Open Library demande seulement les champs nécessaires et conserve les éditions", async () => {
    let requested;
    const adapter = createOpenLibraryAdapter({
      fetch: async (url) => {
        requested = new URL(url);
        return jsonResponse({ docs: [{
          key: "/works/OL1W",
          title: "Œuvre",
          author_name: ["Auteur"],
          first_publish_year: 1998,
          editions: { docs: [{ key: "/books/OL1M", title: "Édition", publish_date: ["2001"], isbn: ["0-306-40615-2"] }] },
        }] });
      },
      environment: catalogEnvironment(),
      now: () => new Date("2026-08-07T10:00:00.000Z"),
    });
    const result = await adapter.search({ mode: "author", query: "Auteur" }, new AbortController().signal);
    assert.equal(requested.pathname, "/search.json");
    assert.equal(requested.searchParams.get("author"), "Auteur");
    assert.equal(requested.searchParams.get("lang"), "fr");
    assert.equal(requested.searchParams.get("limit"), "10");
    assert.notEqual(requested.searchParams.get("fields"), "*");
    assert.match(requested.searchParams.get("fields"), /(?:^|,)editions(?:,|$)/);
    assert.match(requested.searchParams.get("fields"), /editions\.key/);
    assert.equal(result[0].primaryClaim.provider, "open-library");
    assert.equal(result[0].editions[0].editionRef, "open-library:/books/OL1M");
  });

  test("BnF produit une requête SRU 1.2 et parse les namespaces et répétitions", async () => {
    let requested;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <srw:numberOfRecords>1</srw:numberOfRecords>
        <srw:records><srw:record><srw:recordData><dc:record>
          <dc:identifier>ark:/12148/cb1</dc:identifier><dc:title>Titre BnF</dc:title>
          <dc:creator>Auteur A</dc:creator><dc:creator>Auteur B</dc:creator>
          <dc:description>Description BnF</dc:description>
          <dc:language>fre</dc:language><dc:date>2020</dc:date><dc:identifier>ISBN 9780306406157</dc:identifier>
        </dc:record></srw:recordData></srw:record></srw:records>
      </srw:searchRetrieveResponse>`;
    const adapter = createBnfSruAdapter({
      fetch: async (url) => {
        requested = new URL(url);
        return new Response(xml, { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } });
      },
      environment: catalogEnvironment(),
      now: () => new Date("2026-08-07T10:00:00.000Z"),
    });
    const result = await adapter.search({ mode: "title", query: "Titre" }, new AbortController().signal);
    assert.equal(requested.searchParams.get("version"), "1.2");
    assert.equal(requested.pathname, "/api/SRU");
    assert.equal(requested.searchParams.get("operation"), "searchRetrieve");
    assert.equal(requested.searchParams.get("recordSchema"), "dublincore");
    assert.equal(requested.searchParams.get("maximumRecords"), "10");
    assert.equal(result[0].primaryClaim.sourceId, "ark:/12148/cb1");
    assert.deepEqual(result[0].authors.map((author) => author.value), ["Auteur A", "Auteur B"]);
    assert.equal(result[0].description.value, "Description BnF");
    assert.equal(result[0].identifiers[0].value.value, "9780306406157");
  });

  test("le parseur BnF refuse DOCTYPE, entités et arbres trop profonds", async () => {
    for (const xml of [
      `<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x>&secret;</x>`,
      `<searchRetrieveResponse><records></searchRetrieveResponse>`,
      `<a>${"<b>".repeat(33)}x${"</b>".repeat(33)}</a>`,
    ]) {
      const adapter = createBnfSruAdapter({
        fetch: async () => new Response(xml, { status: 200, headers: { "content-type": "application/xml" } }),
        environment: catalogEnvironment(),
      });
      await assert.rejects(
        () => adapter.search({ mode: "title", query: "x" }, new AbortController().signal),
        (error) => error?.code === "CATALOG_RESPONSE_INVALID",
      );
    }
  });

  test("le lecteur HTTP refuse redirections, mauvais MIME, origine et corps supérieurs à 1 Mio", async () => {
    const allowed = new Set(["https://www.googleapis.com"]);
    for (const response of [
      new Response(null, { status: 302, headers: { location: "https://evil.invalid" } }),
      new Response("{}", { status: 200, headers: { "content-type": "text/html" } }),
      new Response("x".repeat(1_048_577), { status: 200, headers: { "content-type": "application/json" } }),
    ]) {
      await assert.rejects(
        () => readBoundedCatalogResponse(response, {
          requestUrl: new URL("https://www.googleapis.com/books/v1/volumes"),
          allowedOrigins: allowed,
          mediaType: "json",
        }),
        CatalogHttpError,
      );
    }
    await assert.rejects(
      () => readBoundedCatalogResponse(jsonResponse({}), {
        requestUrl: new URL("https://evil.invalid/books"),
        allowedOrigins: allowed,
        mediaType: "json",
      }),
      (error) => error?.code === "CATALOG_ORIGIN_FORBIDDEN",
    );

    const redirected = jsonResponse({});
    Object.defineProperty(redirected, "url", { value: "https://evil.invalid/result" });
    await assert.rejects(
      () => readBoundedCatalogResponse(redirected, {
        requestUrl: new URL("https://www.googleapis.com/books"),
        allowedOrigins: allowed,
        mediaType: "json",
      }),
      (error) => error?.code === "CATALOG_ORIGIN_FORBIDDEN",
    );

    const interrupted = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.error(new Error("socket reset with private body"));
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
    await assert.rejects(
      () => readBoundedCatalogResponse(interrupted, {
        requestUrl: new URL("https://www.googleapis.com/books"),
        allowedOrigins: allowed,
        mediaType: "json",
      }),
      (error) => error?.code === "CATALOG_BODY_READ_FAILED" && !String(error.message).includes("private"),
    );
  });

  test("les adaptateurs refusent les contrats JSON invalides et les statuts bruts", async () => {
    const google = createGoogleBooksAdapter({
      fetch: async () => jsonResponse({ items: "not-an-array" }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => google.search({ mode: "title", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_RESPONSE_INVALID",
    );
    const googleContradictory = createGoogleBooksAdapter({
      fetch: async () => jsonResponse({ totalItems: 0, items: [{ id: "g-invalid", volumeInfo: { title: "Titre" } }] }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => googleContradictory.search({ mode: "title", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_RESPONSE_INVALID",
    );
    const googleUnusable = createGoogleBooksAdapter({
      fetch: async () => jsonResponse({ totalItems: 1, items: [{}] }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => googleUnusable.search({ mode: "title", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_RESPONSE_INVALID",
    );

    const openLibrary = createOpenLibraryAdapter({
      fetch: async () => new Response("rate limited private message", { status: 429, headers: { "content-type": "application/json" } }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => openLibrary.search({ mode: "author", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_HTTP_STATUS" && !String(error.message).includes("private"),
    );
    const openLibraryUnusable = createOpenLibraryAdapter({
      fetch: async () => jsonResponse({ docs: [{}] }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => openLibraryUnusable.search({ mode: "author", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_RESPONSE_INVALID",
    );

    const bnf = createBnfSruAdapter({
      fetch: async () => new Response("<searchRetrieveResponse><diagnostics><message>secret</message></diagnostics></searchRetrieveResponse>", { status: 200, headers: { "content-type": "application/xml" } }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => bnf.search({ mode: "title", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_RESPONSE_INVALID" && !String(error.message).includes("secret"),
    );
    const bnfUnusable = createBnfSruAdapter({
      fetch: async () => new Response("<searchRetrieveResponse><numberOfRecords>1</numberOfRecords><records><record><recordData /></record></records></searchRetrieveResponse>", { status: 200, headers: { "content-type": "application/xml" } }),
      environment: catalogEnvironment(),
    });
    await assert.rejects(
      () => bnfUnusable.search({ mode: "title", query: "x" }, new AbortController().signal),
      (error) => error?.code === "CATALOG_RESPONSE_INVALID",
    );
  });

  test("la configuration est tolérante au build et stricte au point d'usage", () => {
    assert.deepEqual(readCatalogEnvironment({}), {
      googleBooksBaseUrl: undefined,
      googleBooksApiKey: undefined,
      openLibraryBaseUrl: undefined,
      bnfBaseUrl: undefined,
      enableE2eHarness: false,
    });
    const official = requireCatalogEnvironment({});
    assert.equal(official.googleBooksBaseUrl, "https://www.googleapis.com");
    assert.equal(official.openLibraryBaseUrl, "https://openlibrary.org");
    assert.equal(official.bnfBaseUrl, "https://catalogue.bnf.fr");
    assert.throws(
      () => requireCatalogEnvironment({ CATALOG_GOOGLE_BOOKS_BASE_URL: "http://example.com" }),
      /CATALOG_GOOGLE_BOOKS_BASE_URL/,
    );
    assert.equal(requireCatalogEnvironment({
      ENABLE_E2E_HARNESS: "1",
      CATALOG_GOOGLE_BOOKS_BASE_URL: "http://127.0.0.1:4101",
      CATALOG_OPEN_LIBRARY_BASE_URL: "http://localhost:4102",
      CATALOG_BNF_BASE_URL: "http://[::1]:4103",
    }).enableE2eHarness, true);
  });
}
