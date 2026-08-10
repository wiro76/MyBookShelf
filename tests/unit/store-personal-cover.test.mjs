import { describe, expect, it, vi } from "vitest";
import { storePersonalCover } from "../../src/modules/media/application/store-personal-cover.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const processor = {
  inspect: vi.fn().mockResolvedValue({ format: "image/png", width: 10, height: 20 }),
  createPrivateVariant: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), width: 10, height: 20 }),
};

describe("storePersonalCover", () => {
  it("uploads deterministic private objects before persisting the receipt", async () => {
    const objects = { putObject: vi.fn().mockResolvedValue(undefined) };
    const repository = { savePrepared: vi.fn().mockResolvedValue(undefined) };
    const result = await storePersonalCover(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      { bytes: png, declaredMimeType: "image/png", rightsConfirmed: true },
      processor,
      { objects, repository },
    );

    expect(result.assetId).toMatch(/^[0-9a-f-]{36}$/);
    expect(objects.putObject).toHaveBeenCalledTimes(2);
    expect(repository.savePrepared).toHaveBeenCalledWith(expect.objectContaining({ userId: "11111111-1111-4111-8111-111111111111" }));
  });

  it("scopes the asset identity per user", async () => {
    const repository = { savePrepared: vi.fn().mockResolvedValue(undefined) };
    const objects = { putObject: vi.fn().mockResolvedValue(undefined) };
    const first = await storePersonalCover("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", { bytes: png, declaredMimeType: "image/png", rightsConfirmed: true }, processor, { objects, repository });
    const second = await storePersonalCover("33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444", { bytes: png, declaredMimeType: "image/png", rightsConfirmed: true }, processor, { objects, repository });
    expect(first.assetId).not.toBe(second.assetId);
  });
});
