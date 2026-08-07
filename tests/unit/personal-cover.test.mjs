import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { registerHooks } from "node:module";

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); } catch (error) {
    if (specifier.startsWith(".") && !specifier.endsWith(".ts")) return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    throw error;
  }
} });
const { createSharpPersonalCoverProcessor } = await import(new URL("../../src/modules/media/adapters/sharp-personal-cover.ts", import.meta.url));
const { preparePersonalCover } = await import(new URL("../../src/modules/media/application/prepare-personal-cover.ts", import.meta.url));
const { PersonalCoverValidationError } = await import(new URL("../../src/modules/media/domain/personal-cover.ts", import.meta.url));

const processor = createSharpPersonalCoverProcessor();
const png = await sharp({ create: { width: 20, height: 30, channels: 3, background: "#234567" } }).png().toBuffer();

test("prépare une couverture en supprimant les métadonnées et en la gardant en quarantaine", async () => {
  const asset = await preparePersonalCover({ bytes: png, declaredMimeType: "image/png", rightsConfirmed: true, originalFileName: "couverture.png" }, processor);
  assert.equal(asset.state, "quarantined");
  assert.equal(asset.width, 20);
  assert.equal(asset.height, 30);
  assert.equal(asset.variant.mimeType, "image/webp");
  assert.equal((await sharp(Buffer.from(asset.variant.bytes)).metadata()).exif, undefined);
  assert.match(asset.originalSha256, /^[0-9a-f]{64}$/);
});

test("refuse un droit non confirmé", async () => {
  await assert.rejects(() => preparePersonalCover({ bytes: png, declaredMimeType: "image/png", rightsConfirmed: false }, processor), PersonalCoverValidationError);
});

test("refuse un type déclaré qui ne correspond pas aux octets", async () => {
  await assert.rejects(() => preparePersonalCover({ bytes: png, declaredMimeType: "image/jpeg", rightsConfirmed: true }, processor), /INVALID_BYTES/);
});

test("refuse des octets qui ne portent pas une signature image", async () => {
  await assert.rejects(() => preparePersonalCover({ bytes: new Uint8Array([1, 2, 3, 4]), declaredMimeType: "image/png", rightsConfirmed: true }, processor), /INVALID_BYTES/);
});

test("refuse un fichier dépassant 20 Mio avant traitement", async () => {
  await assert.rejects(() => preparePersonalCover({ bytes: new Uint8Array(20 * 1024 * 1024 + 1), declaredMimeType: "image/png", rightsConfirmed: true }, processor), PersonalCoverValidationError);
});
