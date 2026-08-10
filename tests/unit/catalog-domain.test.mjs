import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "CATALOG_DOMAIN_TYPE_STRIPPING";
const exists = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;
    if (specifier.startsWith("@/")) candidate = resolve(ROOT, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    if (candidate) {
      for (const path of [candidate, `${candidate}.ts`, resolve(candidate, "index.ts")]) {
        if (exists(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

let domain = null;
try {
  domain = await import(pathToFileURL(resolve(ROOT, "src/modules/catalog/domain/normalized-candidate.ts")).href);
} catch (error) {
  const strippingError = error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension/.test(String(error?.message ?? ""));
  if (process.env[RELAUNCH] || !strippingError) throw error;
  const env = { ...process.env, [RELAUNCH]: "1" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], { stdio: "inherit", env });
  process.exitCode = child.status ?? 1;
}

if (domain) {
  const { CatalogCandidateError, createNormalizedCandidate, createSourceClaim, mergeCandidates, normalizeIsbn } = domain;
  const claim = (provider, sourceId, projection = { title: "Dune" }) => createSourceClaim({
    provider, sourceId, projection, collectedAt: "2026-08-07T10:00:00.000Z", rights: { status: "unknown" },
  });
  const candidate = ({ provider = "google-books", sourceId = "g-1", title = "Dune", isbn, editions = [] } = {}) => {
    const source = claim(provider, sourceId, { title, isbn });
    return createNormalizedCandidate({
      candidateKind: editions.length ? "work-with-editions" : "edition-only",
      primaryClaimRef: source.claimRef,
      sources: [source],
      title: { value: title, claimRefs: [source.claimRef] },
      authors: [{ value: "Frank Herbert", claimRefs: [source.claimRef] }],
      identifiers: isbn ? [{ value: { scheme: "isbn-13", value: isbn }, claimRefs: [source.claimRef] }] : [],
      editions,
    });
  };

  test("normalise et valide ISBN-10/13", () => {
    assert.equal(normalizeIsbn("0-306-40615-2"), "9780306406157");
    assert.equal(normalizeIsbn("978-0-306-40615-7"), "9780306406157");
    assert.equal(normalizeIsbn("978-0-306-40615-8"), null);
  });

  test("produit claims, empreintes et références déterministes sans collectedAt", () => {
    const first = claim("google-books", "g-1", { b: 2, a: " Dune " });
    const second = createSourceClaim({ ...first, projection: { a: " Dune ", b: 2 }, collectedAt: "2027-01-01T00:00:00.000Z" });
    assert.match(first.fingerprintSha256, /^[a-f0-9]{64}$/);
    assert.equal(first.claimRef, second.claimRef);
    assert.equal(first.fingerprintSha256, second.fingerprintSha256);
  });

  test("refuse titre absent, source instable et provenance inconnue", () => {
    const source = claim("google-books", "g-1");
    assert.throws(() => createNormalizedCandidate({ primaryClaimRef: source.claimRef, sources: [source], title: { value: " ", claimRefs: [source.claimRef] } }), CatalogCandidateError);
    assert.throws(() => createSourceClaim({ provider: "google-books", sourceId: " ", projection: {}, collectedAt: "2026-08-07T10:00:00.000Z", rights: { status: "unknown" } }), CatalogCandidateError);
    assert.throws(() => createNormalizedCandidate({ primaryClaimRef: source.claimRef, sources: [source], title: { value: "Dune", claimRefs: ["missing"] } }), CatalogCandidateError);
  });

  test("borne chaînes, listes et candidats consolidés", () => {
    const source = claim("google-books", "g-1");
    assert.throws(() => createNormalizedCandidate({ primaryClaimRef: source.claimRef, sources: [source], title: { value: "x".repeat(501), claimRefs: [source.claimRef] } }), CatalogCandidateError);
    assert.equal(mergeCandidates(Array.from({ length: 30 }, (_, index) => candidate({ sourceId: `g-${index}` }))).length, 25);
  });

  test("fusionne seulement ISBN exact ou claim identique et conserve les provenances", () => {
    const google = candidate({ isbn: "9780306406157" });
    const open = candidate({ provider: "open-library", sourceId: "ol-1", isbn: "0-306-40615-2" });
    const merged = mergeCandidates([google, open]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].sources.length, 2);
    assert.deepEqual(new Set(merged[0].authors[0].claimRefs), new Set(merged[0].sources.map((source) => source.claimRef)));
    assert.equal(mergeCandidates([candidate(), candidate({ provider: "open-library", sourceId: "ol-2", title: "Dune" })]).length, 2);
  });

  test("garde candidateRef stable avec des compléments et la priorité de la primaryClaim", () => {
    const google = candidate({ isbn: "9780306406157" });
    const open = candidate({ provider: "open-library", sourceId: "ol-1", isbn: "9780306406157" });
    const bnf = candidate({ provider: "bnf", sourceId: "bnf-1", isbn: "9780306406157" });
    assert.equal(mergeCandidates([google])[0].candidateRef, mergeCandidates([google, open])[0].candidateRef);
    assert.equal(mergeCandidates([google])[0].candidateRef, mergeCandidates([bnf, open, google])[0].candidateRef);
    assert.equal(mergeCandidates([bnf, open, google])[0].primaryClaim.provider, "google-books");
  });

  test("préserve la granularité œuvre/éditions et ne fusionne pas des éditions sans preuve", () => {
    const source = claim("google-books", "g-edition");
    const edition = { editionRef: "edition:g-edition", title: { value: "Dune", claimRefs: [source.claimRef] }, languages: [], identifiers: [] };
    const work = createNormalizedCandidate({ candidateKind: "work-with-editions", primaryClaimRef: source.claimRef, sources: [source], title: { value: "Dune", claimRefs: [source.claimRef] }, editions: [edition] });
    assert.equal(work.candidateKind, "work-with-editions");
    assert.equal(work.editions.length, 1);
  });

  test("fusionne les éditions sur ISBN exact en conservant leurs claims", () => {
    const build = (provider, sourceId) => {
      const source = claim(provider, sourceId);
      const isbn = { value: { scheme: "isbn-13", value: "9780306406157" }, claimRefs: [source.claimRef] };
      return createNormalizedCandidate({
        candidateKind: "work-with-editions",
        primaryClaimRef: source.claimRef,
        sources: [source],
        title: { value: "Dune", claimRefs: [source.claimRef] },
        identifiers: [isbn],
        editions: [{ editionRef: `edition:${sourceId}`, title: { value: "Dune", claimRefs: [source.claimRef] }, languages: [], identifiers: [isbn] }],
      });
    };
    const merged = mergeCandidates([build("google-books", "g-1"), build("open-library", "ol-1")])[0];
    assert.equal(merged.editions.length, 1);
    assert.equal(merged.editions[0].title.claimRefs.length, 2);
  });

  test("distingue deux versions de claim sans rendre candidateRef instable", () => {
    const firstClaim = claim("google-books", "g-version", { title: "Titre initial" });
    const secondClaim = claim("google-books", "g-version", { title: "Titre corrigé" });
    const first = createNormalizedCandidate({ primaryClaimRef: firstClaim.claimRef, sources: [firstClaim], title: { value: "Titre initial", claimRefs: [firstClaim.claimRef] } });
    const second = createNormalizedCandidate({ primaryClaimRef: secondClaim.claimRef, sources: [secondClaim], title: { value: "Titre corrigé", claimRefs: [secondClaim.claimRef] } });
    assert.notEqual(first.primaryClaim.claimRef, second.primaryClaim.claimRef);
    assert.equal(first.candidateRef, second.candidateRef);
    const merged = mergeCandidates([first, second])[0];
    assert.equal(merged.sources.length, 1);
    assert.ok(merged.title.claimRefs.includes(first.primaryClaim.claimRef));
  });

  test("refuse les claims orphelines et une primaryClaim qui contourne la priorité", () => {
    const google = claim("google-books", "g-priority");
    const open = claim("open-library", "ol-priority");
    assert.throws(() => createNormalizedCandidate({
      primaryClaimRef: google.claimRef,
      sources: [google, open],
      title: { value: "Dune", claimRefs: [google.claimRef] },
    }), CatalogCandidateError);
    assert.throws(() => createNormalizedCandidate({
      primaryClaimRef: open.claimRef,
      sources: [google, open],
      title: { value: "Dune", claimRefs: [google.claimRef, open.claimRef] },
    }), CatalogCandidateError);
  });

  test("calcule la fermeture transitive des preuves exactes", () => {
    const build = (provider, sourceId, isbns) => {
      const source = claim(provider, sourceId, { isbns });
      return createNormalizedCandidate({
        primaryClaimRef: source.claimRef,
        sources: [source],
        title: { value: "Dune", claimRefs: [source.claimRef] },
        identifiers: isbns.map((value) => ({ value: { scheme: "isbn-13", value }, claimRefs: [source.claimRef] })),
      });
    };
    const isbn1 = "9780306406157";
    const isbn2 = "9782070405374";
    const merged = mergeCandidates([
      build("google-books", "a", [isbn1]),
      build("open-library", "b", [isbn2]),
      build("bnf", "bridge", [isbn1, isbn2]),
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].sources.length, 3);
  });

  test("borne les listes fusionnées sans faire échouer la recherche", () => {
    const build = (provider, sourceId, prefix) => {
      const source = claim(provider, sourceId, { prefix });
      return createNormalizedCandidate({
        primaryClaimRef: source.claimRef,
        sources: [source],
        title: { value: "Dune", claimRefs: [source.claimRef] },
        authors: Array.from({ length: 30 }, (_, index) => ({ value: `${prefix}-${index}`, claimRefs: [source.claimRef] })),
        identifiers: [{ value: { scheme: "isbn-13", value: "9780306406157" }, claimRefs: [source.claimRef] }],
      });
    };
    const merged = mergeCandidates([build("google-books", "g-list", "g"), build("open-library", "ol-list", "ol")]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].authors.length, 50);
  });
}
