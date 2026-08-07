import { createHash } from "node:crypto";

export const FREE_APPEARANCE_OPTIONS = Object.freeze({
  structures: Object.freeze([
    Object.freeze({ id: "frame", label: "Cadre droit", description: "Une structure sobre et régulière." }),
    Object.freeze({ id: "arch", label: "Niches douces", description: "Des ouvertures légèrement arrondies." }),
    Object.freeze({ id: "wide", label: "Montants larges", description: "Une présence plus affirmée autour des étagères." }),
  ]),
  finishes: Object.freeze([
    Object.freeze({ id: "oak", label: "Chêne clair", swatch: "#c99b68" }),
    Object.freeze({ id: "walnut", label: "Noyer", swatch: "#795548" }),
    Object.freeze({ id: "white", label: "Blanc mat", swatch: "#e7e5e4" }),
  ]),
});

export type AppearancePreference = Readonly<{ structureId: string; finishId: string }>;

const structureIds: ReadonlySet<string> = new Set(FREE_APPEARANCE_OPTIONS.structures.map((option) => option.id));
const finishIds: ReadonlySet<string> = new Set(FREE_APPEARANCE_OPTIONS.finishes.map((option) => option.id));

export function validateAppearancePreference(input: unknown): AppearancePreference {
  const value = input as Partial<AppearancePreference> | null;
  if (!value || typeof value.structureId !== "string" || !structureIds.has(value.structureId) || typeof value.finishId !== "string" || !finishIds.has(value.finishId)) {
    throw new Error("LIBRARY_APPEARANCE_INVALID");
  }
  return Object.freeze({ structureId: value.structureId, finishId: value.finishId });
}

export function appearanceRequestDigest(userId: string, preference: AppearancePreference): string {
  const valid = validateAppearancePreference(preference);
  return createHash("sha256").update(JSON.stringify({ userId, ...valid }), "utf8").digest("hex");
}
