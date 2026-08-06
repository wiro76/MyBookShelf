import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

const { Client } = pg;
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "LIBRARY_CANARY_TYPE_STRIPPING";

const fileExists = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;
    if (specifier.startsWith("@/")) candidate = resolvePath(ROOT, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      candidate = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (candidate) {
      for (const path of [candidate, `${candidate}.ts`, resolvePath(candidate, "index.ts")]) {
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

const importSource = (path) => import(pathToFileURL(resolvePath(ROOT, path)).href);
const strippingError = (error) =>
  error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension "\.ts"/.test(String(error?.message ?? ""));

let modules = null;
try {
  const [kernel, application, adapter] = await Promise.all([
    importSource("src/shared/kernel/index.ts"),
    importSource("src/modules/library/application/library-view-state.ts"),
    importSource("src/modules/library/adapters/postgres-library-view-state.ts"),
  ]);
  modules = { kernel, application, adapter };
} catch (error) {
  if (process.env[RELAUNCH] || !strippingError(error)) throw error;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: { ...process.env, [RELAUNCH]: "1" },
  });
  process.exitCode = child.status ?? 1;
}

if (modules) {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL est obligatoire");
  process.env.DATABASE_URL = databaseUrl;

  const OWNER = "91111111-1111-4111-8111-111111111111";
  const OTHER = "92222222-2222-4222-8222-222222222222";
  const MODULE_A = "a1111111-1111-4111-8111-111111111111";
  const MODULE_B = "a2222222-2222-4222-8222-222222222222";
  const SHELF_A = "b1111111-1111-4111-8111-111111111111";
  const SHELF_B = "b2222222-2222-4222-8222-222222222222";
  const COPY_A = "c1111111-1111-4111-8111-111111111111";
  const COPY_B = "c2222222-2222-4222-8222-222222222222";
  const COMMAND = "d1111111-1111-4111-8111-111111111111";
  const CONCURRENT_COMMAND = "d3333333-3333-4333-8333-333333333333";

  const target = (overrides = {}) => ({
    status: "finished",
    moduleId: MODULE_A,
    shelfId: SHELF_A,
    copyId: COPY_A,
    modulePosition: 0,
    shelfPosition: 0,
    itemPosition: 0,
    ...overrides,
  });

  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const { confirmLibraryContext, resumeLibraryContext } = modules.application;
  const { createPostgresLibraryViewStateRepository } = modules.adapter;
  const { closeDatabasePool } = modules.kernel;
  const repository = createPostgresLibraryViewStateRepository();

  try {
    await admin.query("insert into auth.users (id) values ($1), ($2)", [OWNER, OTHER]);
    const original = target();
    const command = { commandId: COMMAND, expectedRevision: 0, target: original };

    const confirmed = await confirmLibraryContext(OWNER, command, [original], repository);
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.revision, 1);

    const replayed = await confirmLibraryContext(OWNER, command, [original], repository);
    assert.equal(replayed.status, "replayed");
    assert.equal(replayed.revision, 1);

    const alternative = target({ copyId: COPY_B, itemPosition: 1 });
    await assert.rejects(
      () => confirmLibraryContext(OWNER, { ...command, target: alternative }, [alternative], repository),
      (error) => error?.code === "LIBRARY_VIEW_STATE_COMMAND_REUSED",
    );
    await assert.rejects(
      () => confirmLibraryContext(OWNER, {
        commandId: "d2222222-2222-4222-8222-222222222222",
        expectedRevision: 0,
        target: alternative,
      }, [alternative], repository),
      (error) => error?.code === "LIBRARY_VIEW_STATE_CONFLICT",
    );

    const loaded = await repository.load(OWNER);
    assert.equal(loaded?.copyId, COPY_A);
    assert.equal(await repository.load(OTHER), null, "RLS masque le contexte au second utilisateur");

    const moved = target({ moduleId: MODULE_B, shelfId: SHELF_B, modulePosition: 1, shelfPosition: 1 });
    const replayedAfterMove = await confirmLibraryContext(OWNER, command, [moved], repository);
    assert.equal(replayedAfterMove.status, "replayed", "un recu reste rejouable apres evolution de la projection");

    const concurrentCommand = { commandId: CONCURRENT_COMMAND, expectedRevision: 1, target: original };
    const concurrentResults = await Promise.all([
      confirmLibraryContext(OWNER, concurrentCommand, [original], repository),
      confirmLibraryContext(OWNER, concurrentCommand, [original], repository),
    ]);
    assert.deepEqual(
      concurrentResults.map(({ status }) => status).sort(),
      ["confirmed", "replayed"],
      "deux confirmations identiques concurrentes ne creent qu'une revision",
    );
    assert.deepEqual(concurrentResults.map(({ revision }) => revision), [2, 2]);

    const movedResult = await resumeLibraryContext(OWNER, [moved, alternative], repository);
    assert.equal(movedResult.status, "adjusted");
    assert.equal(movedResult.target.copyId, COPY_A, "l'emplacement canonique courant de l'exemplaire gagne");

    const deletedResult = await resumeLibraryContext(OWNER, [alternative], repository);
    assert.equal(deletedResult.status, "adjusted");
    assert.equal(deletedResult.target.copyId, COPY_B, "la suppression choisit le voisin restant sans ecriture de rangement");

    const persisted = await admin.query("select revision, copy_id from library.library_view_states where user_id = $1", [OWNER]);
    assert.deepEqual(persisted.rows, [{ revision: "2", copy_id: COPY_A }], "la reprise ne modifie jamais le signet confirme");
    process.stdout.write("Canari contexte: confirmation, rejeu, conflit, RLS et replis exacts.\n");
  } finally {
    await closeDatabasePool().catch(() => {});
    await admin.query("delete from auth.users where id = any($1::uuid[])", [[OWNER, OTHER]]).catch(() => {});
    await admin.end();
  }
}
