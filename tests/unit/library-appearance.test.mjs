import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const appearance = await import(pathToFileURL(resolve("src/modules/library/domain/library-appearance.ts")).href);

test("valide les structures et finitions gratuites", () => {
  assert.deepEqual(appearance.validateAppearancePreference({ structureId: "frame", finishId: "oak" }), { structureId: "frame", finishId: "oak" });
  assert.throws(() => appearance.validateAppearancePreference({ structureId: "paid-structure", finishId: "oak" }), /LIBRARY_APPEARANCE_INVALID/);
  assert.throws(() => appearance.validateAppearancePreference({ structureId: "frame", finishId: "gold" }), /LIBRARY_APPEARANCE_INVALID/);
});

test("les options gratuites sont stables et indépendantes du rangement", () => {
  assert.ok(appearance.FREE_APPEARANCE_OPTIONS.structures.length >= 3);
  assert.ok(appearance.FREE_APPEARANCE_OPTIONS.finishes.length >= 3);
  assert.equal(appearance.appearanceRequestDigest("user-1", { structureId: "frame", finishId: "oak" }).length, 64);
});
