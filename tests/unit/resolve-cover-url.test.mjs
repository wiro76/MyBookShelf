import { describe, expect, it, vi } from "vitest";
import { resolveCoverUrl } from "../../src/modules/media/application/resolve-cover-url.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";

function dependencies(record) {
  return {
    repository: { findVariant: vi.fn().mockResolvedValue(record) },
    storage: { createSignedUrl: vi.fn().mockResolvedValue("https://signed.test/cover") },
  };
}

describe("resolveCoverUrl", () => {
  it("signs only an owned private variant", async () => {
    const deps = dependencies({ assetId, userId, state: "private", variantKind: "private-webp", objectKey: "private/key.webp" });
    await expect(resolveCoverUrl(userId, assetId, deps)).resolves.toBe("https://signed.test/cover");
    expect(deps.storage.createSignedUrl).toHaveBeenCalledWith("private/key.webp", 300);
  });

  it("returns no URL for revoked or quarantined assets", async () => {
    for (const state of ["revoked", "quarantined"]) {
      const deps = dependencies({ assetId, userId, state, variantKind: "private-webp", objectKey: "private/key.webp" });
      await expect(resolveCoverUrl(userId, assetId, deps)).resolves.toBeNull();
      expect(deps.storage.createSignedUrl).not.toHaveBeenCalled();
    }
  });

  it("does not sign a variant owned by another user", async () => {
    const deps = dependencies({ assetId, userId: "33333333-3333-4333-8333-333333333333", state: "private", variantKind: "private-webp", objectKey: "private/key.webp" });
    await expect(resolveCoverUrl(userId, assetId, deps)).resolves.toBeNull();
    expect(deps.storage.createSignedUrl).not.toHaveBeenCalled();
  });
});
