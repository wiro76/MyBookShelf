import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { statSync } from "node:fs";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = specifier.startsWith("@/") ? resolve(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") && context.parentURL?.endsWith(".ts") ? resolve(dirname(fileURLToPath(context.parentURL)), specifier) : null;
    if (candidate) for (const path of [candidate, `${candidate}.ts`]) { try { if (statSync(path).isFile()) return { url: pathToFileURL(path).href, shortCircuit: true }; } catch {} }
    return nextResolve(specifier, context);
  },
});

const domain = await import(pathToFileURL(resolve(ROOT, "src/modules/library/domain/library-foundation.ts")).href);
const { planAppendPlacement, validateAppendPlacementInput } = domain;
const shelf = (shelfPosition, occupiedUnits = 0) => ({ id: `shelf-${shelfPosition}`, moduleId: "module-0", status: "want-to-read", shelfPosition, capacityUnits: 20, occupiedUnits });
const makeModule = (shelves) => ({ id: "module-0", status: "want-to-read", modulePosition: 0, capacityUnits: 20, shelves });

test("valide les entrées d'append sans accepter une largeur nulle", () => {
  assert.deepEqual(validateAppendPlacementInput({ status: "want-to-read", copyId: "copy-1", widthUnits: 2 }), { status: "want-to-read", copyId: "copy-1", widthUnits: 2 });
  assert.throws(() => validateAppendPlacementInput({ status: "unknown", copyId: "copy-1", widthUnits: 1 }), { code: "LIBRARY_FOUNDATION_INVALID" });
  assert.throws(() => validateAppendPlacementInput({ status: "reading", copyId: "copy-1", widthUnits: 0 }), { code: "LIBRARY_FOUNDATION_INVALID" });
});

test("append choisit la prochaine position disponible sans créer de module prématurément", () => {
  const plan = planAppendPlacement([makeModule([shelf(0, 20), shelf(1, 3), shelf(2, 20)])], { status: "want-to-read", copyId: "copy-1", widthUnits: 4 });
  assert.deepEqual(plan, { status: "want-to-read", copyId: "copy-1", modulePosition: 0, shelfPosition: 1, itemPosition: 3, createdModule: false });
});

test("append crée exactement le module suivant si toutes les étagères sont pleines", () => {
  const plan = planAppendPlacement([makeModule([shelf(0, 20), shelf(1, 20), shelf(2, 20), shelf(3, 20), shelf(4, 20)])], { status: "want-to-read", copyId: "copy-2", widthUnits: 1 });
  assert.deepEqual(plan, { status: "want-to-read", copyId: "copy-2", modulePosition: 1, shelfPosition: 0, itemPosition: 0, createdModule: true });
});

test("append refuse une fondation absente", () => {
  assert.throws(() => planAppendPlacement([], { status: "finished", copyId: "copy-3", widthUnits: 1 }), { code: "LIBRARY_FOUNDATION_NOT_INITIALIZED" });
});
