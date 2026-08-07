import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "LIBRARY_FOUNDATION_CANARY_TYPE_STRIPPING";
const exists = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
registerHooks({
  resolve(specifier, context, nextResolve) {
    let candidate = null;
    if (specifier.startsWith("@/")) candidate = resolvePath(ROOT, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) candidate = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    if (candidate) for (const path of [candidate, `${candidate}.ts`, resolvePath(candidate, "index.ts")]) if (exists(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    return nextLoad(url, context);
  },
});

let modules = null;
try {
  const [kernel, adapter] = await Promise.all([
    import(pathToFileURL(resolvePath(ROOT, "src/shared/kernel/index.ts")).href),
    import(pathToFileURL(resolvePath(ROOT, "src/modules/library/adapters/postgres-library-foundation.ts")).href),
  ]);
  modules = { kernel, adapter };
} catch (error) {
  if (process.env[RELAUNCH] || !/Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(error?.message ?? ""))) throw error;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], { stdio: "inherit", env: { ...process.env, [RELAUNCH]: "1" } });
  process.exitCode = child.status ?? 1;
}

if (modules) {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL est obligatoire");
  process.env.DATABASE_URL = databaseUrl;
  const { Client } = pg;
  const OWNER = "a3111111-1111-4111-8111-111111111111";
  const OTHER = "a3222222-2222-4222-8222-222222222222";
  const COPY_IDS = Array.from({ length: 13 }, (_, index) => `c33${String(index + 1).padStart(2, "0")}111-1111-4111-8111-111111111111`);
  const COMMAND_IDS = Array.from({ length: 13 }, (_, index) => `d33${String(index + 1).padStart(2, "0")}111-1111-7111-8111-111111111111`);
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  const repository = modules.adapter.createPostgresLibraryFoundationRepository();
  try {
    await admin.query("insert into auth.users (id) values ($1), ($2)", [OWNER, OTHER]);
    const before = await repository.load(OWNER);
    assert.deepEqual(before.statuses.map(({ modules: values }) => values.length), [0, 0, 0]);
    await Promise.all([repository.ensure(OWNER), repository.ensure(OWNER)]);
    const initialized = await repository.load(OWNER);
    assert.deepEqual(initialized.statuses.map(({ modules: values }) => values.length), [1, 1, 1]);
    assert.deepEqual(initialized.statuses.map(({ modules: values }) => values[0].shelves.length), [5, 5, 5]);
    assert.equal((await admin.query("select count(*)::int as count from library.copies where user_id = $1", [OWNER])).rows[0].count, 0, "ensure ne crée aucun copy");
    await admin.query("insert into library.copies (id, user_id, edition_id) select * from unnest($1::uuid[], $2::uuid[], $3::uuid[])", [COPY_IDS, Array(COPY_IDS.length).fill(OWNER), COPY_IDS]);
    const first = await repository.appendPlacement(OWNER, COMMAND_IDS[0], { status: "want-to-read", copyId: COPY_IDS[0], widthUnits: 20 });
    const replay = await repository.appendPlacement(OWNER, COMMAND_IDS[0], { status: "want-to-read", copyId: COPY_IDS[0], widthUnits: 20 });
    assert.equal(first.status, "confirmed");
    assert.deepEqual(replay, { ...first, status: "replayed" });
    for (let index = 1; index < 6; index += 1) await repository.appendPlacement(OWNER, COMMAND_IDS[index], { status: "want-to-read", copyId: COPY_IDS[index], widthUnits: 20 });
    const expanded = await repository.load(OWNER);
    assert.equal(expanded.statuses.find(({ status }) => status === "want-to-read").modules.length, 2, "un seul module suivant est créé");
    for (let index = 6; index < 11; index += 1) await repository.appendPlacement(OWNER, COMMAND_IDS[index], { status: "reading", copyId: COPY_IDS[index], widthUnits: 20 });
    await Promise.all([
      repository.appendPlacement(OWNER, COMMAND_IDS[11], { status: "reading", copyId: COPY_IDS[11], widthUnits: 20 }),
      repository.appendPlacement(OWNER, COMMAND_IDS[12], { status: "reading", copyId: COPY_IDS[12], widthUnits: 20 }),
    ]);
    const concurrent = await repository.load(OWNER);
    assert.equal(concurrent.statuses.find(({ status }) => status === "reading").modules.length, 2, "les append concurrents créent un seul module suivant");
    assert.equal((await admin.query("select count(*)::int as count from library.placements where user_id = $1", [OWNER])).rows[0].count, 13);
    const other = await repository.load(OTHER);
    assert.deepEqual(other.statuses.map(({ modules: values }) => values.length), [0, 0, 0], "RLS isole le second utilisateur");
    process.stdout.write("Canari fondation: initialisation idempotente, projection réelle, append atomique, rejeu et RLS.\n");
  } finally {
    await modules.kernel.closeDatabasePool().catch(() => {});
    await admin.query("delete from auth.users where id = any($1::uuid[])", [[OWNER, OTHER]]).catch(() => {});
    await admin.end();
  }
}
