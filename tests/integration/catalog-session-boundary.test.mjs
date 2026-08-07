import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "CATALOG_SESSION_BOUNDARY_TYPE_STRIPPING";
const isFile = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};

const MOCKS = new Map([
  ["@/modules/identity/application/session", "mock:catalog-session"],
  ["@/modules/catalog/application/search-catalog", "mock:catalog-search"],
  ["@/modules/catalog/adapters/google-books", "mock:catalog-google"],
  ["@/modules/catalog/adapters/open-library", "mock:catalog-open-library"],
  ["@/modules/catalog/adapters/bnf-sru", "mock:catalog-bnf"],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocked = MOCKS.get(specifier);
    if (mocked) return { url: mocked, shortCircuit: true };

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
    if (url === "mock:catalog-session") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export async function getVerifiedSession() { return globalThis.__catalogSession; }",
      };
    }
    if (url === "mock:catalog-search") {
      return {
        format: "module",
        shortCircuit: true,
        source: "export async function searchCatalog() { globalThis.__catalogSupplierCalls += 1; return globalThis.__catalogOutcome; }",
      };
    }
    if (url.startsWith("mock:catalog-")) {
      const exportName = url === "mock:catalog-google"
        ? "createGoogleBooksAdapter"
        : url === "mock:catalog-open-library"
          ? "createOpenLibraryAdapter"
          : "createBnfSruAdapter";
      return {
        format: "module",
        shortCircuit: true,
        source: `export function ${exportName}() { globalThis.__catalogSupplierCalls += 1; return { id: '${url.slice('mock:catalog-'.length)}' }; }`,
      };
    }
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    }
    return nextLoad(url, context);
  },
});

let action = null;
try {
  action = await import(pathToFileURL(resolve(ROOT, "src/app/catalogue/actions.ts")).href);
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

if (action) {
  for (const session of [{ status: "anonymous" }, { status: "unavailable" }]) {
    test(`une session ${session.status} bloque tout appel fournisseur`, async () => {
      globalThis.__catalogSession = session;
      globalThis.__catalogSupplierCalls = 0;
      const form = new FormData();
      form.set("mode", "title");
      form.set("query", "requete-privee");

      const state = await action.rechercherCatalogue({ attempt: 4, sessionUnavailable: false }, form);

      assert.equal(globalThis.__catalogSupplierCalls, 0);
      assert.deepEqual(state, {
        attempt: 5,
        sessionUnavailable: session.status === "unavailable",
        sessionAnonymous: session.status === "anonymous",
      });
    });
  }

  test("une session authentifiée ne sérialise que le DTO de présentation", async () => {
    globalThis.__catalogSession = { status: "authenticated", user: { id: "user-1" } };
    globalThis.__catalogSupplierCalls = 0;
    globalThis.__catalogOutcome = {
      status: "complete",
      mode: "title",
      query: "Dune",
      failures: [],
      candidates: [{
        candidateRef: "candidate-safe",
        title: { value: "Dune", claimRefs: ["claim-secret"] },
        authors: [{ value: "Frank Herbert", claimRefs: ["claim-secret"] }],
        languages: [],
        identifiers: [],
        editions: [{
          editionRef: "google-books:source-secret-edition",
          title: { value: "Dune", claimRefs: ["claim-secret"] },
          pageCount: { value: 500, claimRefs: ["claim-secret"] },
          languages: [{ value: "fr", claimRefs: ["claim-secret"] }],
          identifiers: [{ value: { scheme: "isbn-13", value: "9782070405374" }, claimRefs: ["claim-secret"] }],
        }],
        primaryClaim: { provider: "google-books", sourceId: "source-secret", claimRef: "claim-secret", fingerprintSha256: "fingerprint-secret", collectedAt: "2026-08-07T10:00:00.000Z", rights: { status: "unknown" } },
        sources: [{ provider: "google-books", sourceId: "source-secret", claimRef: "claim-secret", fingerprintSha256: "fingerprint-secret", collectedAt: "2026-08-07T10:00:00.000Z", rights: { status: "unknown" } }],
      }],
    };
    const form = new FormData();
    form.set("mode", "title");
    form.set("query", "Dune");
    const state = await action.rechercherCatalogue({ attempt: 0, sessionUnavailable: false }, form);
    const serialized = JSON.stringify(state);
    assert.equal(globalThis.__catalogSupplierCalls, 4);
    for (const forbidden of ["source-secret", "claim-secret", "fingerprint-secret", "collectedAt", "rights", "failures"]) {
      assert.doesNotMatch(serialized, new RegExp(forbidden));
    }
    assert.equal(state.outcome.candidates[0].title, "Dune");
    assert.equal(state.outcome.candidates[0].editions.length, 1);
    assert.match(state.outcome.candidates[0].editions[0].selectionRef, /^edition-[0-9a-f]{32}$/);
    assert.equal(state.outcome.candidates[0].editions[0].coverage, "not-provided");
    assert.deepEqual(state.outcome.candidates[0].editions[0].provenance, ["google-books"]);
    assert.doesNotMatch(serialized, /source-secret-edition|claim-secret|fingerprint-secret/);
    assert.deepEqual(state.outcome.candidates[0].providers, ["google-books"]);
  });
}
