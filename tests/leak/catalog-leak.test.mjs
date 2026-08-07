import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "CATALOG_LEAK_TYPE_STRIPPING";
const isFile = (path) => {
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
      for (const path of [candidate, `${candidate}.ts`, `${candidate}.tsx`, resolve(candidate, "index.ts")]) {
        if (isFile(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
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
  const [domain, search] = await Promise.all([
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/domain/normalized-candidate.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/catalog/application/search-catalog.ts")).href),
  ]);
  modules = { domain, search };
} catch (error) {
  const strippingError = error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension "\.tsx?"/u.test(String(error?.message ?? ""));
  if (process.env[RELAUNCH] || !strippingError) throw error;
  const environment = { ...process.env, [RELAUNCH]: "1" };
  delete environment.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: environment,
  });
  process.exitCode = child.status ?? 1;
}

if (modules) {
  const { createNormalizedCandidate, createSourceClaim } = modules.domain;
  const { searchCatalog } = modules.search;

  const QUERY = "requete-confidentielle-7f3a";
  const TITLE = "titre-confidentiel-8b4c";
  const AUTHOR = "auteur-confidentiel-9d5e";
  const SOURCE_ID = "source-confidentielle-a6f1";
  const SECRET = "secret-fournisseur-b7c2-0123456789abcdef0123456789abcdef";
  const PROVIDER_MESSAGE = "message-brut-fournisseur-c8d3";
  const PROVIDER_URL = "https://catalogue-prive.invalid/books?token=d9e4";
  const FORBIDDEN = [QUERY, TITLE, AUTHOR, SOURCE_ID, SECRET, PROVIDER_MESSAGE, PROVIDER_URL];

  function candidate(provider) {
    const claim = createSourceClaim({
      provider,
      sourceId: SOURCE_ID,
      projection: { title: TITLE, authors: [AUTHOR] },
      collectedAt: "2026-08-07T10:00:00.000Z",
      rights: { status: "unknown" },
    });
    return createNormalizedCandidate({
      primaryClaimRef: claim.claimRef,
      sources: [claim],
      title: { value: TITLE, claimRefs: [claim.claimRef] },
      authors: [{ value: AUTHOR, claimRefs: [claim.claimRef] }],
    });
  }

  function assertAbsent(label, serialized, forbidden = FORBIDDEN) {
    const target = serialized.toLowerCase();
    for (const value of forbidden) {
      assert.ok(!target.includes(value.toLowerCase()), `${label}: fuite de ${value}`);
    }
  }

  test("les logs catalogue ne contiennent ni requete, metadonnees, identifiant ni erreur fournisseur", async () => {
    const lines = [];
    const originalInfo = console.info;
    const originalWarn = console.warn;
    console.info = (line) => lines.push(String(line));
    console.warn = (line) => lines.push(String(line));

    try {
      const providers = [
        { id: "google-books", search: async () => [candidate("google-books")] },
        { id: "open-library", search: async () => { throw new Error(`${PROVIDER_MESSAGE} ${PROVIDER_URL} ${SECRET}`); } },
        { id: "bnf", search: async () => [] },
      ];
      const outcome = await searchCatalog(
        { mode: "title", query: QUERY },
        { providers, correlationId: "019fdb32-aeb9-7612-9e58-1d94df83423f", now: () => 100 },
      );

      assert.equal(outcome.status, "partial");
      assert.equal(lines.length, 3);
      for (const line of lines) {
        const record = JSON.parse(line);
        assert.deepEqual(
          Object.keys(record).sort(),
          ["count", "durationMs", "level", "message", "outcome", "provider", "requestId", "timestamp"].sort(),
        );
        assert.match(record.provider, /^(google-books|open-library|bnf)$/);
        assertAbsent("log catalogue", line);
      }
    } finally {
      console.info = originalInfo;
      console.warn = originalWarn;
    }
  });

  test("un echec fournisseur produit uniquement un outcome et un code stables", async () => {
    const failure = async () => { throw new Error(`${PROVIDER_MESSAGE} ${PROVIDER_URL} ${SECRET}`); };
    const outcome = await searchCatalog(
      { mode: "author", query: QUERY },
      {
        providers: [
          { id: "google-books", search: failure },
          { id: "open-library", search: failure },
          { id: "bnf", search: failure },
        ],
        logger: { info() {}, warn() {} },
        now: () => 100,
      },
    );

    assert.equal(outcome.status, "unavailable");
    assert.deepEqual(outcome.failures, [
      { provider: "google-books", code: "CATALOG_PROVIDER_FAILED" },
      { provider: "open-library", code: "CATALOG_PROVIDER_FAILED" },
      { provider: "bnf", code: "CATALOG_PROVIDER_FAILED" },
    ]);
    assertAbsent("outcome d'echec", JSON.stringify({ status: outcome.status, failures: outcome.failures }), [
      SECRET,
      PROVIDER_MESSAGE,
      PROVIDER_URL,
    ]);
  });
}
