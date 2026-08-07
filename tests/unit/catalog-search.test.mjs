import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "CATALOG_SEARCH_TYPE_STRIPPING";
const exists = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;
    if (specifier.startsWith("@/")) candidate = resolve(ROOT, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    if (candidate) for (const path of [candidate, `${candidate}.ts`, resolve(candidate, "index.ts")]) if (exists(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    return nextLoad(url, context);
  },
});

let modules = null;
try {
  const [domain, search, selection] = await Promise.all([
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/domain/normalized-candidate.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/application/search-catalog.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/application/edition-selection.ts")).href),
  ]);
  modules = { domain, search, selection };
} catch (error) {
  const strippingError = error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension/.test(String(error?.message ?? ""));
  if (process.env[RELAUNCH] || !strippingError) throw error;
  const env = { ...process.env, [RELAUNCH]: "1" }; delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], { stdio: "inherit", env });
  process.exitCode = child.status ?? 1;
}

if (modules) {
  const { createNormalizedCandidate, createSourceClaim } = modules.domain;
  const { searchCatalog } = modules.search;
  const { createEditionSelectionRef } = modules.selection;
  const makeCandidate = (provider, sourceId = provider) => {
    const source = createSourceClaim({ provider, sourceId, projection: { title: "Dune" }, collectedAt: "2026-08-07T10:00:00.000Z", rights: { status: "unknown" } });
    return createNormalizedCandidate({ primaryClaimRef: source.claimRef, sources: [source], title: { value: "Dune", claimRefs: [source.claimRef] } });
  };
  const provider = (id, result = [makeCandidate(id)]) => ({ id, search: async () => result });
  const providers = () => [provider("google-books"), provider("open-library"), provider("bnf")];

  test("refuse et normalise la requête avant tout appel", async () => {
    let calls = 0;
    const ps = providers().map((entry) => ({ ...entry, search: async () => { calls += 1; return []; } }));
    assert.equal((await searchCatalog({ mode: "title", query: "   " }, { providers: ps })).status, "invalid");
    assert.equal((await searchCatalog({ mode: "author", query: "x".repeat(201) }, { providers: ps })).status, "invalid");
    const outcome = await searchCatalog({ mode: "title", query: "  Ｄｕｎｅ   saga " }, { providers: ps });
    assert.equal(outcome.query, "Dune saga");
    assert.equal(calls, 3);
  });

  test("produit une référence d'édition opaque et stable", () => {
    const first = createEditionSelectionRef("candidate-a", "google-books:volume-1");
    assert.equal(first, createEditionSelectionRef("candidate-a", "google-books:volume-1"));
    assert.match(first, /^edition-[0-9a-f]{32}$/);
    assert.notEqual(first, createEditionSelectionRef("candidate-a", "google-books:volume-2"));
    assert.doesNotMatch(first, /volume-1|google-books|claim|source/iu);
  });

  test("appelle les trois fournisseurs en parallèle, une fois, dans l'ordre de priorité", async () => {
    const calls = [];
    const ps = providers().reverse().map((entry) => ({ ...entry, search: async (request) => { calls.push([entry.id, request]); return [makeCandidate(entry.id)]; } }));
    const outcome = await searchCatalog({ mode: "author", query: "Frank Herbert" }, { providers: ps });
    assert.equal(outcome.status, "complete");
    assert.deepEqual(outcome.candidates.map((item) => item.primaryClaim.provider), ["google-books", "open-library", "bnf"]);
    assert.equal(calls.length, 3);
  });

  test("applique la table de vérité exhaustive", async () => {
    const failed = (id) => ({ id, search: async () => { throw new Error("secret Dune https://provider.invalid"); } });
    assert.equal((await searchCatalog({ mode: "title", query: "Dune" }, { providers: providers() })).status, "complete");
    assert.equal((await searchCatalog({ mode: "title", query: "Dune" }, { providers: providers().map((p) => provider(p.id, [])) })).status, "empty");
    assert.equal((await searchCatalog({ mode: "title", query: "Dune" }, { providers: [provider("google-books", []), failed("open-library"), failed("bnf")] })).status, "partial");
    assert.equal((await searchCatalog({ mode: "title", query: "Dune" }, { providers: providers().map((p) => failed(p.id)) })).status, "unavailable");
  });

  test("borne à 10 résultats par source puis 25 consolidés", async () => {
    const ps = providers().map((entry) => provider(entry.id, Array.from({ length: 12 }, (_, index) => makeCandidate(entry.id, `${entry.id}-${index}`))));
    const outcome = await searchCatalog({ mode: "title", query: "Dune" }, { providers: ps });
    assert.equal(outcome.candidates.length, 25);
  });

  test("annule chaque source à son timeout et tous les appels au timeout global", async () => {
    const aborted = [];
    const hanging = (id) => ({ id, search: (_request, signal) => new Promise((resolve) => signal.addEventListener("abort", () => { aborted.push(id); resolve([]); }, { once: true })) });
    const outcome = await searchCatalog({ mode: "title", query: "Dune" }, { providers: providers().map((p) => hanging(p.id)), sourceTimeoutMs: 15, globalTimeoutMs: 30 });
    assert.equal(outcome.status, "unavailable");
    assert.deepEqual(new Set(aborted), new Set(["google-books", "open-library", "bnf"]));
  });

  test("le délai global annule les trois appels même si leur délai propre est plus long", async () => {
    const aborted = [];
    const hanging = (id) => ({ id, search: (_request, signal) => new Promise((resolve) => signal.addEventListener("abort", () => { aborted.push(id); resolve([]); }, { once: true })) });
    const outcome = await searchCatalog({ mode: "title", query: "Dune" }, { providers: providers().map((p) => hanging(p.id)), sourceTimeoutMs: 100, globalTimeoutMs: 15 });
    assert.equal(outcome.status, "unavailable");
    assert.deepEqual(new Set(aborted), new Set(["google-books", "open-library", "bnf"]));
    assert.ok(outcome.failures.every((failure) => failure.code === "CATALOG_PROVIDER_TIMEOUT"));
  });

  test("un signal déjà annulé empêche tout appel fournisseur", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const ps = providers().map((entry) => ({ ...entry, search: async () => { calls += 1; return []; } }));
    const outcome = await searchCatalog({ mode: "title", query: "Dune" }, { providers: ps, signal: controller.signal });
    assert.equal(calls, 0);
    assert.equal(outcome.status, "unavailable");
  });

  test("journalise seulement des métadonnées expurgées et stabilise les erreurs", async () => {
    const events = [];
    const logger = { info: (message, fields) => events.push({ message, fields }), warn: (message, fields) => events.push({ message, fields }) };
    const ps = [provider("google-books"), { id: "open-library", search: async () => { throw new Error("Dune secret body"); } }, provider("bnf", [])];
    const outcome = await searchCatalog({ mode: "title", query: "Dune" }, { providers: ps, correlationId: "corr-1", logger });
    assert.equal(outcome.status, "partial");
    assert.deepEqual(Object.keys(events[0].fields).sort(), ["correlationId", "count", "durationMs", "outcome", "provider"].sort());
    assert.ok(!JSON.stringify({ events, outcome }).includes("secret body"));
    assert.deepEqual(outcome.failures, [{ provider: "open-library", code: "CATALOG_PROVIDER_FAILED" }]);
  });
}
