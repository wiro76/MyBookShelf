import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith("@/")) return { url: new URL(`file:///E:/AI/Romane/src/${specifier.slice(2)}.ts`).href, shortCircuit: true }; return nextResolve(specifier, context); } });
const domain = await import(new URL("../../src/modules/library/domain/library-want-to-read.ts", import.meta.url));

const valid = { candidateKey: `candidate_${"a".repeat(64)}`, editionKey: `edition-${"b".repeat(32)}`, workTitle: "Dune", editionTitle: "Dune — édition test", identifiers: ["ISBN-13 9780000000000"], provenance: ["google-books"] };

test("valide une sélection opaque et borne la provenance", () => {
  assert.deepEqual(domain.validateAddEditionAsWantToRead(valid), valid);
  assert.throws(() => domain.validateAddEditionAsWantToRead({ ...valid, editionKey: "open-library:/books/OL1M" }), { code: "LIBRARY_WANT_TO_READ_INVALID" });
  assert.throws(() => domain.validateAddEditionAsWantToRead({ ...valid, provenance: ["unknown"] }), { code: "LIBRARY_WANT_TO_READ_INVALID" });
});

test("valide une édition manuelle avec métadonnées facultatives", () => {
  const manual = domain.validateAddEditionAsWantToRead({
    candidateKey: `candidate_${"c".repeat(64)}`,
    editionKey: `edition-${"d".repeat(32)}`,
    workTitle: "Une œuvre absente",
    editionTitle: "Édition personnelle",
    identifiers: [],
    provenance: ["manual"],
    author: "Un auteur",
    pageCount: 240,
    series: "Une série",
    volume: "1",
  });
  assert.equal(manual.provenance[0], "manual");
  assert.equal(manual.pageCount, 240);
});
