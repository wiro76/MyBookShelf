import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { statSync } from "node:fs";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({ resolve(specifier, context, nextResolve) {
  const candidate = specifier.startsWith("@/") ? resolve(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") && context.parentURL?.endsWith(".ts") ? resolve(dirname(fileURLToPath(context.parentURL)), specifier) : null;
  if (candidate) for (const path of [candidate, `${candidate}.ts`]) { try { if (statSync(path).isFile()) return { url: pathToFileURL(path).href, shortCircuit: true }; } catch {} }
  return nextResolve(specifier, context);
} });

const { resolveCoverUrl } = await import(pathToFileURL(resolve(ROOT, "src/modules/media/application/resolve-cover-url.ts")).href);
const userId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const dependencies = (record) => {
  const calls = [];
  return { repository: { findVariant: async () => record }, storage: { createSignedUrl: async (...args) => { calls.push(args); return "https://signed.test/cover"; } }, calls };
};

test("signe uniquement une variante privée appartenant à l'utilisateur", async () => {
  const deps = dependencies({ assetId, userId, state: "private", variantKind: "private-webp", objectKey: "private/key.webp" });
  assert.equal(await resolveCoverUrl(userId, assetId, deps), "https://signed.test/cover");
  assert.deepEqual(deps.calls, [["private/key.webp", 300]]);
});

test("ne signe pas une couverture révoquée, quarantaine ou étrangère", async () => {
  for (const state of ["revoked", "quarantined"]) {
    const deps = dependencies({ assetId, userId, state, variantKind: "private-webp", objectKey: "private/key.webp" });
    assert.equal(await resolveCoverUrl(userId, assetId, deps), null);
    assert.deepEqual(deps.calls, []);
  }
  const deps = dependencies({ assetId, userId: "33333333-3333-4333-8333-333333333333", state: "private", variantKind: "private-webp", objectKey: "private/key.webp" });
  assert.equal(await resolveCoverUrl(userId, assetId, deps), null);
  assert.deepEqual(deps.calls, []);
});
