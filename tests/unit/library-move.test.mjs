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

const { planPlacementMove, validateMovePlacementInput } = await import(pathToFileURL(resolve(ROOT, "src/modules/library/domain/library-move.ts")).href);
const item = (id, itemPosition, widthUnits = 2) => ({ id, copyId: `copy-${id}`, title: id, author: null, editionTitle: id, itemPosition, widthUnits, coverStatus: "not-provided" });
const shelf = (id, items = [], capacityUnits = 20) => ({ id, moduleId: `module-${id}`, status: "want-to-read", shelfPosition: 0, capacityUnits, occupiedUnits: items.reduce((sum, current) => sum + current.widthUnits, 0), items });

test("valide la commande de déplacement et son contrôle de version", () => {
  assert.deepEqual(validateMovePlacementInput({ placementId: "p1", destinationShelfId: "s2", destinationPosition: 2, expectedVersion: 3 }), { placementId: "p1", destinationShelfId: "s2", destinationPosition: 2, expectedVersion: 3 });
  assert.throws(() => validateMovePlacementInput({ placementId: "p1", destinationShelfId: "s2", destinationPosition: -1, expectedVersion: 3 }), { code: "LIBRARY_MOVE_INVALID" });
  assert.throws(() => validateMovePlacementInput({ placementId: "p1", destinationShelfId: "s2", destinationPosition: 2, expectedVersion: 0 }), { code: "LIBRARY_MOVE_INVALID" });
});

test("reflow une étagère source et insère le livre à une frontière de largeur", () => {
  const plan = planPlacementMove(shelf("s1", [item("p1", 0), item("p2", 2), item("p3", 4)]), shelf("s2", [item("p4", 0)]), { placementId: "p2", destinationShelfId: "s2", destinationPosition: 2, expectedVersion: 1 });
  assert.deepEqual(plan.assignments, [
    { placementId: "p1", shelfId: "s1", moduleId: "module-s1", status: "want-to-read", itemPosition: 0 },
    { placementId: "p3", shelfId: "s1", moduleId: "module-s1", status: "want-to-read", itemPosition: 2 },
    { placementId: "p4", shelfId: "s2", moduleId: "module-s2", status: "want-to-read", itemPosition: 0 },
    { placementId: "p2", shelfId: "s2", moduleId: "module-s2", status: "want-to-read", itemPosition: 2 },
  ]);
});

test("refuse une position qui coupe un livre ou dépasse la capacité", () => {
  const source = shelf("s1", [item("p1", 0), item("p2", 2)]);
  assert.throws(() => planPlacementMove(source, shelf("s2", [item("p3", 0)]), { placementId: "p1", destinationShelfId: "s2", destinationPosition: 1, expectedVersion: 1 }), { code: "LIBRARY_MOVE_POSITION_INVALID" });
  assert.throws(() => planPlacementMove(source, shelf("s2", [item("p3", 0)], 2), { placementId: "p1", destinationShelfId: "s2", destinationPosition: 2, expectedVersion: 1 }), { code: "LIBRARY_MOVE_CAPACITY_EXCEEDED" });
});
