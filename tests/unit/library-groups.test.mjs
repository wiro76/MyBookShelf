import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { statSync } from "node:fs";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidate = specifier.startsWith("@/") ? resolve(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") && context.parentURL?.endsWith(".ts") ? resolve(dirname(fileURLToPath(context.parentURL)), specifier) : null;
    if (candidate) for (const path of [candidate, `${candidate}.ts`]) { try { if (statSync(path).isFile()) return { url: pathToFileURL(path).href, shortCircuit: true }; } catch {} }
    return nextResolve(specifier, context);
  },
});

const { validateAssignThemeInput, validateCreateGroupInput, validateCreateThemeInput } = await import(pathToFileURL(resolve(ROOT, "src/modules/library/domain/library-groups.ts")).href);
const copyA = "c4111111-1111-4111-8111-111111111111";
const copyB = "c4222222-2222-4222-8222-222222222222";
const theme = "e4111111-1111-4111-8111-111111111111";

test("valide un groupe sans introduire de notion de placement", () => {
  assert.deepEqual(validateCreateGroupInput({ name: "Saga", copyIds: [copyA, copyB] }), { name: "Saga", copyIds: [copyA, copyB] });
  assert.throws(() => validateCreateGroupInput({ name: "Saga", copyIds: [copyA, copyA] }), { code: "LIBRARY_GROUPS_INVALID" });
});

test("valide un thème accessible avec repère non exclusivement coloré", () => {
  assert.deepEqual(validateCreateThemeInput({ name: "Polars", label: "Thème Polars", icon: "book", pattern: "dots", color: "#123456" }), { name: "Polars", label: "Thème Polars", icon: "book", pattern: "dots", color: "#123456" });
  assert.throws(() => validateCreateThemeInput({ name: "Polars", label: "Thème", color: "orange" }), { code: "LIBRARY_GROUPS_COLOR_INVALID" });
});

test("refuse une association vers un thème ou des copies invalides", () => {
  assert.deepEqual(validateAssignThemeInput({ themeId: theme, copyIds: [copyA] }), { themeId: theme, copyIds: [copyA] });
  assert.throws(() => validateAssignThemeInput({ themeId: "theme", copyIds: [copyA] }), { code: "LIBRARY_GROUPS_INVALID" });
});
