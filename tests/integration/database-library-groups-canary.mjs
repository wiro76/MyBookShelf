import assert from "node:assert/strict";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidate = specifier.startsWith("@/") ? resolve(ROOT, "src", specifier.slice(2)) : specifier.startsWith(".") && context.parentURL?.endsWith(".ts") ? resolve(dirname(fileURLToPath(context.parentURL)), specifier) : null;
    if (candidate) for (const path of [candidate, `${candidate}.ts`, join(candidate, "index.ts")]) { try { if (statSync(path).isFile()) return { url: pathToFileURL(path).href, shortCircuit: true }; } catch {} }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".json")) return { format: "module", shortCircuit: true, source: `export default ${readFileSync(fileURLToPath(url), "utf8")};` };
    return nextLoad(url, context);
  },
});

const [{ createPostgresLibraryGroupsRepository }, { closeDatabasePool }] = await Promise.all([
  import(pathToFileURL(resolve(ROOT, "src/modules/library/adapters/postgres-library-groups.ts")).href),
  import(pathToFileURL(resolve(ROOT, "src/shared/kernel/index.ts")).href),
]);
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL est obligatoire");
process.env.DATABASE_URL = databaseUrl;
const OWNER = "a5111111-1111-4111-8111-111111111111";
const COPIES = ["c5111111-1111-4111-8111-111111111111", "c5222222-2222-4222-8222-222222222222"];
const WORK = "b5111111-1111-4111-8111-111111111111";
const EDITION = "b5222222-2222-4222-8222-222222222222";
const GROUP_COMMAND = "d5111111-1111-4111-8111-111111111111";
const THEME_COMMAND = "d5222222-2222-4222-8222-222222222222";
const ASSIGN_COMMAND = "d5333333-3333-4333-8333-333333333333";
const REMOVE_THEME_COMMAND = "d5444444-4444-4444-8444-444444444444";
const REMOVE_GROUP_A_COMMAND = "d5555555-5555-4555-8555-555555555555";
const REMOVE_GROUP_B_COMMAND = "d5666666-6666-4666-8666-666666666666";
const admin = new pg.Client({ connectionString: databaseUrl });
await admin.connect();
try {
  await admin.query("insert into auth.users (id) values ($1)", [OWNER]);
  await admin.query("insert into library.works (id, canonical_key, title, provenance) values ($1, 'canary-work', 'Canary work', '[]'::jsonb)", [WORK]);
  await admin.query("insert into library.editions (id, work_id, canonical_key, title, identifiers, provenance) values ($1, $2, 'canary-edition', 'Canary edition', '[]'::jsonb, '[]'::jsonb)", [EDITION, WORK]);
  await admin.query("insert into library.copies (id, user_id, edition_id) select ids.id, $2, $3 from unnest($1::uuid[]) ids(id)", [COPIES, OWNER, EDITION]);
  const repository = createPostgresLibraryGroupsRepository();
  const groupInput = { name: "Saga test", copyIds: COPIES };
  const group = await repository.createGroup(OWNER, GROUP_COMMAND, groupInput);
  const replay = await repository.createGroup(OWNER, GROUP_COMMAND, groupInput);
  assert.equal(group.status, "confirmed");
  assert.equal(replay.status, "replayed");
  const theme = await repository.createTheme(OWNER, THEME_COMMAND, { name: "Repère test", label: "Repère test", icon: "book", pattern: "dots", color: "#123456" });
  await repository.assignTheme(OWNER, ASSIGN_COMMAND, { themeId: theme.theme.id, copyIds: [COPIES[0]] });
  const rows = await admin.query("select count(*)::int as count from library.library_group_members where user_id = $1", [OWNER]);
  const themeRows = await admin.query("select count(*)::int as count from library.library_theme_members where user_id = $1", [OWNER]);
  assert.equal(rows.rows[0].count, 2);
  assert.equal(themeRows.rows[0].count, 1);
  const removedTheme = await repository.removeThemeMember(OWNER, REMOVE_THEME_COMMAND, { themeId: theme.theme.id, copyId: COPIES[0] });
  const replayedTheme = await repository.removeThemeMember(OWNER, REMOVE_THEME_COMMAND, { themeId: theme.theme.id, copyId: COPIES[0] });
  assert.equal(removedTheme.status, "confirmed");
  assert.equal(replayedTheme.status, "replayed");
  const removedGroupA = await repository.removeGroupMember(OWNER, REMOVE_GROUP_A_COMMAND, { groupId: group.group.id, copyId: COPIES[0] });
  assert.equal(removedGroupA.status, "confirmed");
  const removedGroupB = await repository.removeGroupMember(OWNER, REMOVE_GROUP_B_COMMAND, { groupId: group.group.id, copyId: COPIES[1] });
  assert.equal(removedGroupB.status, "confirmed");
  const emptyGroups = await admin.query("select count(*)::int as count from library.library_groups where user_id = $1", [OWNER]);
  assert.equal(emptyGroups.rows[0].count, 0);
  process.stdout.write("Canari groupes: création, association, retrait idempotent et suppression atomique du groupe vide confirmés.\n");
} finally {
  await closeDatabasePool().catch(() => {});
  await admin.query("delete from auth.users where id = $1", [OWNER]).catch(() => {});
  await admin.end();
}
