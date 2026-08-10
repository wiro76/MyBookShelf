import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidate = specifier.startsWith("@/") ? resolve(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") && context.parentURL?.endsWith(".ts") ? resolve(dirname(fileURLToPath(context.parentURL)), specifier) : null;
    if (candidate) for (const path of [candidate, `${candidate}.ts`, resolve(candidate, "index.ts")]) { try { if (statSync(path).isFile()) return { url: pathToFileURL(path).href, shortCircuit: true }; } catch {} }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    return nextLoad(url, context);
  },
});
const [{ createPostgresLibraryFoundationRepository }, { createPostgresLibraryMoveRepository }, { closeDatabasePool }] = await Promise.all([
  import(pathToFileURL(resolve(ROOT, "src/modules/library/adapters/postgres-library-foundation.ts")).href),
  import(pathToFileURL(resolve(ROOT, "src/modules/library/adapters/postgres-library-move.ts")).href),
  import(pathToFileURL(resolve(ROOT, "src/shared/kernel/index.ts")).href),
]);

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL est obligatoire");
process.env.DATABASE_URL = databaseUrl;
const OWNER = "a4111111-1111-4111-8111-111111111111";
const COPIES = ["c4111111-1111-4111-8111-111111111111", "c4222222-2222-4222-8222-222222222222", "c4333333-3333-4333-8333-333333333333"];
const COMMANDS = ["d4111111-1111-4111-8111-111111111111", "d4222222-2222-4222-8222-222222222222", "d4333333-3333-4333-8333-333333333333"];
const MOVE_COMMAND = "e4111111-1111-4111-8111-111111111111";
const UNDO_COMMAND = "e4222222-2222-4222-8222-222222222222";
const admin = new pg.Client({ connectionString: databaseUrl });
await admin.connect();
try {
  await admin.query("insert into auth.users (id) values ($1)", [OWNER]);
  const foundation = createPostgresLibraryFoundationRepository();
  await foundation.ensure(OWNER);
  await admin.query("insert into library.copies (id, user_id, edition_id) select * from unnest($1::uuid[], $2::uuid[], $3::uuid[])", [COPIES, COPIES.map(() => OWNER), COPIES]);
  for (let index = 0; index < COPIES.length; index += 1) await foundation.appendPlacement(OWNER, COMMANDS[index], { status: "want-to-read", copyId: COPIES[index], widthUnits: 2 });
  const placements = await admin.query("select id, shelf_id, version from library.placements where user_id = $1 order by id", [OWNER]);
  assert.equal(placements.rows.length, 3);
  const shelf = await admin.query("select shelves.id from library.shelves join library.modules on modules.id = shelves.module_id where modules.user_id = $1 and modules.status = 'want-to-read' order by shelves.shelf_position", [OWNER]);
  assert.ok(shelf.rows.length >= 2);
  const selected = placements.rows.slice(0, 2);
  const moved = await createPostgresLibraryMoveRepository().moveSelection(OWNER, MOVE_COMMAND, {
    placementIds: selected.map((item) => item.id),
    destinationShelfId: shelf.rows[1].id,
    destinationPosition: 0,
    expectedVersions: Object.fromEntries(selected.map((item) => [item.id, Number(item.version)])),
  });
  assert.equal(moved.status, "confirmed");
  await admin.query("update library.placements set version = version + 1 where id = $1", [selected[0].id]);
  await assert.rejects(() => createPostgresLibraryMoveRepository().undoSelection(OWNER, UNDO_COMMAND, MOVE_COMMAND), { message: "LIBRARY_MOVE_VERSION_CONFLICT" });
  process.stdout.write("Canari déplacement: sélection atomique confirmée et annulation concurrente refusée.\n");
} finally {
  await closeDatabasePool().catch(() => {});
  await admin.query("delete from auth.users where id = $1", [OWNER]).catch(() => {});
  await admin.end();
}
