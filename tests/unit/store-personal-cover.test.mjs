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

const { storePersonalCover } = await import(pathToFileURL(resolve(ROOT, "src/modules/media/application/store-personal-cover.ts")).href);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const processor = { inspect: async () => ({ format: "image/png", width: 10, height: 20 }), createPrivateVariant: async () => ({ bytes: new Uint8Array([1, 2, 3]), width: 10, height: 20 }) };

test("stocke les objets privés avant le reçu", async () => {
  const objects = { calls: [], putObject: async (...args) => objects.calls.push(args) };
  const repository = { calls: [], savePrepared: async (...args) => repository.calls.push(args) };
  const userId = "11111111-1111-4111-8111-111111111111";
  const result = await storePersonalCover(userId, "22222222-2222-4222-8222-222222222222", { bytes: png, declaredMimeType: "image/png", rightsConfirmed: true }, processor, { objects, repository });
  assert.match(result.assetId, /^[0-9a-f-]{36}$/);
  assert.equal(objects.calls.length, 2);
  assert.equal(repository.calls[0][0].userId, userId);
});

test("isole l'identité média par utilisateur", async () => {
  const makeDeps = () => ({ objects: { putObject: async () => {} }, repository: { savePrepared: async () => {} } });
  const first = await storePersonalCover("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", { bytes: png, declaredMimeType: "image/png", rightsConfirmed: true }, processor, makeDeps());
  const second = await storePersonalCover("33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", { bytes: png, declaredMimeType: "image/png", rightsConfirmed: true }, processor, makeDeps());
  assert.notEqual(first.assetId, second.assetId);
});
