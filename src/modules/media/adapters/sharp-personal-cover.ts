import sharp from "sharp";
import type { PersonalCoverProcessor } from "../application/prepare-personal-cover";

export function createSharpPersonalCoverProcessor(): PersonalCoverProcessor {
  return {
    async inspect(bytes) {
      const metadata = await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000, failOn: "warning" }).metadata();
      if (!metadata.format || !metadata.width || !metadata.height) throw new Error("INVALID_BYTES");
      if (metadata.pages && metadata.pages > 1) throw new Error("MULTI_PAGE_NOT_SUPPORTED");
      const format = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "heif" ? "image/avif" : `image/${metadata.format}`;
      return { format, width: metadata.width, height: metadata.height };
    },
    async createPrivateVariant(bytes) {
      const result = await sharp(Buffer.from(bytes), { limitInputPixels: 40_000_000, failOn: "warning" })
        .rotate()
        .webp({ quality: 88, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return { bytes: result.data, width: result.info.width, height: result.info.height };
    },
  };
}
