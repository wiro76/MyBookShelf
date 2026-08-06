import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "LIBRARY_VIEW_STATE_TYPE_STRIPPING";
const fileExists = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;
    if (specifier.startsWith("@/")) candidate = resolve(ROOT, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (candidate) {
      for (const path of [candidate, `${candidate}.ts`, resolve(candidate, "index.ts")]) {
        if (fileExists(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    }
    return nextLoad(url, context);
  },
});

let modules = null;
try {
  const [domain, application] = await Promise.all([
    import(pathToFileURL(resolve(ROOT, "src/modules/library/domain/library-view-state.ts")).href),
    import(pathToFileURL(resolve(ROOT, "src/modules/library/application/library-view-state.ts")).href),
  ]);
  modules = { domain, application };
} catch (error) {
  const strippingError = error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension "\.ts"/.test(String(error?.message ?? ""));
  if (process.env[RELAUNCH] || !strippingError) throw error;
  const env = { ...process.env, [RELAUNCH]: "1" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], { stdio: "inherit", env });
  process.exitCode = child.status ?? 1;
}

const ids = {
  moduleA: "10000000-0000-4000-8000-000000000001",
  moduleB: "10000000-0000-4000-8000-000000000002",
  shelfA: "20000000-0000-4000-8000-000000000001",
  shelfB: "20000000-0000-4000-8000-000000000002",
  shelfC: "20000000-0000-4000-8000-000000000003",
  copyA: "30000000-0000-4000-8000-000000000001",
  copyB: "30000000-0000-4000-8000-000000000002",
  copyC: "30000000-0000-4000-8000-000000000003",
  copyD: "30000000-0000-4000-8000-000000000004",
};

const target = (overrides = {}) => ({
  status: "finished",
  moduleId: ids.moduleA,
  shelfId: ids.shelfA,
  copyId: ids.copyA,
  modulePosition: 0,
  shelfPosition: 0,
  itemPosition: 0,
  ...overrides,
});

const state = (overrides = {}) => ({
  status: "finished",
  moduleId: ids.moduleA,
  shelfId: ids.shelfA,
  copyId: ids.copyA,
  modulePosition: 0,
  shelfPosition: 0,
  itemPosition: 0,
  revision: 1,
  confirmedAt: "2026-08-06T08:00:00.000Z",
  ...overrides,
});

if (modules) {
const {
  LibraryViewStateError,
  resolveLibraryViewState,
  validateLibraryResumeTarget,
  validateStoredLibraryViewState,
} = modules.domain;
const { confirmLibraryContext, resumeLibraryContext, toLibraryMutationReceipt } = modules.application;

test("restaure la cible exacte sans annonce", () => {
  const current = target();
  const result = resolveLibraryViewState(state(), [current]);
  assert.deepEqual(result, { status: "exact", target: current, adjusted: false, announcement: null });
});

test("suit l'exemplaire déplacé sans faire du contexte une autorité", () => {
  const moved = target({ moduleId: ids.moduleB, shelfId: ids.shelfC, modulePosition: 1, shelfPosition: 2 });
  const result = resolveLibraryViewState(state(), [moved]);
  assert.equal(result.status, "adjusted");
  assert.equal(result.target, moved);
  assert.match(result.announcement, /position disponible la plus proche/i);
});

test("un changement d'indice du même exemplaire est une reprise ajustée", () => {
  const reindexed = target({ itemPosition: 1 });
  const result = resolveLibraryViewState(state(), [reindexed]);
  assert.equal(result.status, "adjusted");
  assert.equal(result.target, reindexed);
});

test("choisit le voisin le plus proche dans la même étagère et départage vers le plus petit indice", () => {
  const before = target({ copyId: ids.copyB, itemPosition: 1 });
  const after = target({ copyId: ids.copyC, itemPosition: 3 });
  const result = resolveLibraryViewState(state({ itemPosition: 2 }), [after, before]);
  assert.equal(result.target.copyId, ids.copyB);
  assert.equal(result.status, "adjusted");
});

test("retombe hiérarchiquement sur étagère, module, statut puis ordre canonique", () => {
  const sameModule = target({ shelfId: ids.shelfB, copyId: ids.copyB, shelfPosition: 2 });
  const sameStatus = target({ moduleId: ids.moduleB, shelfId: ids.shelfC, copyId: ids.copyC, modulePosition: 3 });
  const otherStatus = target({ status: "want-to-read", moduleId: ids.moduleB, shelfId: ids.shelfC, copyId: ids.copyD });
  assert.equal(resolveLibraryViewState(state({ shelfPosition: 1 }), [otherStatus, sameStatus, sameModule]).target.copyId, ids.copyB);
  assert.equal(resolveLibraryViewState(state({ moduleId: ids.moduleA, shelfId: ids.shelfA }), [otherStatus, sameStatus]).target.copyId, ids.copyC);
  assert.equal(resolveLibraryViewState(state({ status: "reading" }), [otherStatus]).target.copyId, ids.copyD);
});

test("normalise l'ordre d'entrée et ne mute ni le contexte ni les cibles", () => {
  const left = target({ copyId: ids.copyB, itemPosition: 1 });
  const right = target({ copyId: ids.copyC, itemPosition: 3 });
  const inputState = Object.freeze(state({ itemPosition: 2 }));
  const inputTargets = Object.freeze([Object.freeze(right), Object.freeze(left)]);
  const first = resolveLibraryViewState(inputState, inputTargets);
  const second = resolveLibraryViewState(inputState, [...inputTargets].reverse());
  assert.deepEqual(first, second);
  assert.deepEqual(inputTargets, [right, left]);
});

test("refuse une projection qui place deux fois le même exemplaire", () => {
  assert.throws(
    () => resolveLibraryViewState(state(), [target(), target({ itemPosition: 1 })]),
    (error) => error?.code === "LIBRARY_VIEW_STATE_INVALID",
  );
});

test("un contexte absent ouvre la première cible canonique et une bibliothèque vide focalise son titre", () => {
  const reading = target({ status: "reading", copyId: ids.copyB });
  const finished = target({ status: "finished", copyId: ids.copyC });
  assert.equal(resolveLibraryViewState(null, [reading, finished]).target.copyId, ids.copyC);
  assert.deepEqual(resolveLibraryViewState(null, []), { status: "empty", adjusted: false, focusTarget: "library-title", announcement: null });
});

test("valide strictement UUID, statuts, indices et hiérarchie", () => {
  assert.deepEqual(validateLibraryResumeTarget(target()), target());
  assert.deepEqual(validateStoredLibraryViewState(state()), state());
  for (const invalid of [
    target({ status: "unknown" }),
    target({ copyId: "not-an-uuid" }),
    target({ itemPosition: -1 }),
  ]) {
    assert.throws(() => validateLibraryResumeTarget(invalid), LibraryViewStateError);
  }
  assert.throws(
    () => validateStoredLibraryViewState(state({ moduleId: null, modulePosition: null })),
    (error) => error?.code === "LIBRARY_VIEW_STATE_INVALID",
  );
});

test("résout 100 cibles de façon stable sans dépasser une borne large", () => {
  const targets = Array.from({ length: 100 }, (_, index) => target({
    copyId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    itemPosition: index,
  }));
  const started = performance.now();
  for (let iteration = 0; iteration < 1_000; iteration += 1) {
    resolveLibraryViewState(state({ copyId: "30000000-0000-4000-8000-999999999999", itemPosition: 50 }), targets);
  }
  assert.ok(performance.now() - started < 500, "1 000 résolutions de 100 cibles restent sous 500 ms");
});

test("la reprise distingue une indisponibilité d'une bibliothèque vide", async () => {
  const unavailable = await resumeLibraryContext("user", [], { load: async () => { throw new Error("database down"); } });
  assert.deepEqual(unavailable, {
    status: "unavailable",
    adjusted: false,
    code: "LIBRARY_VIEW_STATE_UNAVAILABLE",
    announcement: null,
  });
  const empty = await resumeLibraryContext("user", [], { load: async () => null });
  assert.equal(empty.status, "empty");
});

test("la confirmation valide la cible et transmet un hash canonique sans identifiant utilisateur", async () => {
  const current = target();
  const userId = "80000000-0000-4000-8000-000000000001";
  const commandId = "90000000-0000-4000-8000-000000000001";
  const commandType = "library.view-state.confirm";
  const calls = [];
  const repository = {
    load: async () => null,
    replay: async () => null,
    confirm: async (...args) => {
      calls.push(args);
      return { commandId, commandType, status: "confirmed", revision: 1, confirmedAt: "2026-08-06T08:00:00.000Z" };
    },
  };
  const command = {
    commandId,
    commandType,
    actorId: userId,
    aggregateIds: [userId],
    expectedVersions: { libraryViewState: 0 },
    payload: { target: current },
    occurredAt: "2026-08-06T08:00:00.000Z",
  };
  assert.deepEqual(await confirmLibraryContext(userId, command, [current], repository), {
    commandId,
    commandType,
    status: "confirmed",
    revision: 1,
    confirmedAt: "2026-08-06T08:00:00.000Z",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0][2], /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0][2], userId);
  await assert.rejects(
    () => confirmLibraryContext(userId, command, [target({ copyId: ids.copyB })], repository),
    (error) => error?.code === "LIBRARY_VIEW_STATE_TARGET_MISSING",
  );
  assert.equal(calls.length, 1);

  repository.replay = async () => ({ commandId, commandType, status: "replayed", revision: 1, confirmedAt: "2026-08-06T08:00:00.000Z" });
  assert.deepEqual(await confirmLibraryContext(userId, command, [], repository), {
    commandId,
    commandType,
    status: "replayed",
    revision: 1,
    confirmedAt: "2026-08-06T08:00:00.000Z",
  });
  assert.equal(calls.length, 1, "un rejeu ne revalide pas une projection qui a pu evoluer");

  let firstDigest = null;
  repository.replay = async (_userId, _commandId, digest) => {
    firstDigest ??= digest;
    return { commandId, commandType, status: "replayed", revision: 1, confirmedAt: "2026-08-06T08:00:00.000Z" };
  };
  const reorderedTarget = {
    itemPosition: current.itemPosition,
    copyId: current.copyId,
    shelfPosition: current.shelfPosition,
    shelfId: current.shelfId,
    modulePosition: current.modulePosition,
    moduleId: current.moduleId,
    status: current.status,
  };
  await confirmLibraryContext(userId, { ...command, payload: { target: reorderedTarget } }, [], repository);
  assert.equal(firstDigest, calls[0][2], "le hash ne depend pas de l'ordre des proprietes de la cible");

  await assert.rejects(
    () => confirmLibraryContext(userId, { ...command, actorId: ids.copyB }, [current], repository),
    (error) => error?.code === "LIBRARY_VIEW_STATE_INVALID",
  );

  await assert.rejects(
    () => confirmLibraryContext(userId, {
      ...command,
      expectedVersions: { libraryViewState: Number.MAX_SAFE_INTEGER },
    }, [current], repository),
    (error) => error?.code === "LIBRARY_VIEW_STATE_INVALID",
  );

  repository.replay = async () => { throw new Error("database down"); };
  await assert.rejects(
    () => confirmLibraryContext(userId, command, [current], repository),
    (error) => error?.code === "LIBRARY_VIEW_STATE_UNAVAILABLE",
  );
});

test("convertit le reçu de contexte vers le contrat générique autocorrélé", () => {
  assert.deepEqual(toLibraryMutationReceipt({
    commandId: "018f1e23-4567-7abc-8def-0123456789ab",
    commandType: "library.view-state.confirm",
    status: "replayed",
    revision: 4,
    confirmedAt: "2026-08-06T08:00:00.000Z",
  }), {
    commandId: "018f1e23-4567-7abc-8def-0123456789ab",
    commandType: "library.view-state.confirm",
    status: "replayed",
    resultVersions: { libraryViewState: 4 },
    confirmedAt: "2026-08-06T08:00:00.000Z",
  });
});
}
