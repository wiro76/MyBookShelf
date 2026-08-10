import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith(".")) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true }; return nextResolve(specifier, context); } });
const gc = await import(new URL("../../src/modules/media/domain/media-gc.ts", import.meta.url));
const now = new Date("2026-08-07T00:00:00Z");

test("ne collecte jamais un média vivant, référencé ou retenu par sauvegarde", () => {
  const base = { state: "revoked", revokedAt: "2026-07-01T00:00:00Z", hasActiveReference: false, objectHashes: ["a".repeat(64)], retainedHashes: new Set(), now, retentionUntil: new Date("2026-08-01T00:00:00Z") };
  assert.equal(gc.evaluateMediaGc({ ...base, state: "private" }), "retention-active");
  assert.equal(gc.evaluateMediaGc({ ...base, hasActiveReference: true }), "referenced");
  assert.equal(gc.evaluateMediaGc({ ...base, retainedHashes: new Set(["a".repeat(64)]) }), "backup-retained");
  assert.equal(gc.evaluateMediaGc({ ...base, retentionUntil: new Date("2026-09-01T00:00:00Z") }), "retention-active");
  assert.equal(gc.evaluateMediaGc(base), "eligible");
});
