import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) { if (specifier.startsWith(".")) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true }; return nextResolve(specifier, context); } });
const governance = await import(new URL("../../src/modules/media/domain/media-governance.ts", import.meta.url));

test("autorise uniquement les transitions média gouvernées", () => {
  assert.equal(governance.transitionMediaAsset("quarantined", "private", "unknown"), "private");
  assert.equal(governance.transitionMediaAsset("private", "published", "known"), "published");
  assert.equal(governance.transitionMediaAsset("published", "revoked", "known"), "revoked");
  assert.throws(() => governance.transitionMediaAsset("private", "published", "unknown"), { code: "MEDIA_RIGHTS_REQUIRED" });
  assert.throws(() => governance.transitionMediaAsset("revoked", "private", "known"), { code: "MEDIA_ALREADY_REVOKED" });
});
