import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const reservePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return reject(new Error("Port local indisponible"));
    const port = address.port;
    server.close(() => resolve(port));
  });
});
const [apiPort, dbPort, shadowPort] = await Promise.all([reservePort(), reservePort(), reservePort()]);
const workdir = mkdtempSync(join(tmpdir(), "my-bookshelf-supabase-"));
cpSync("supabase", join(workdir, "supabase"), { recursive: true });
const projectId = `mbs-ci-${process.pid}-${Date.now()}`;
const configPath = join(workdir, "supabase/config.toml");
const config = readFileSync(configPath, "utf8")
  .replace(/project_id = ".*"/, `project_id = "${projectId}"`)
  .replace(/port = 54321/, `port = ${apiPort}`)
  .replace(/port = 54322/, `port = ${dbPort}`)
  .replace(/shadow_port = 54320/, `shadow_port = ${shadowPort}`);
writeFileSync(configPath, config);

const supabase = ["--yes", "supabase@2.101.0"];
// Sous Windows, npx est un .cmd : Node refuse de le lancer sans shell depuis la
// mitigation CVE-2024-27980 (ENOENT sur "npx", EINVAL sur "npx.cmd"). Le shell
// n'est activé que là où il est indispensable ; la CI Linux garde le spawn direct.
const useShell = process.platform === "win32";
const quote = (value) => (useShell && /\s/.test(value) ? `"${value}"` : value);
const run = (args, options = {}) => {
  const result = spawnSync("npx", [...supabase, ...args, "--workdir", quote(workdir)], { stdio: "inherit", ...options, shell: useShell });
  if (result.status !== 0) throw new Error(`Supabase a échoué: ${args.join(" ")}${result.error ? ` (${result.error.code})` : ""}`);
};

try {
  run(["start", "--exclude", "studio,imgproxy,edge-runtime,logflare,vector,supavisor,gotrue,kong,mailpit,postgres-meta,postgrest,realtime,storage-api"]);
  run(["db", "reset", "--local"]);
  const sql = [
    "create extension if not exists pgtap with schema extensions;",
    readFileSync("supabase/tests/database/rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/migration-compatibility.test.sql", "utf8"),
    readFileSync("supabase/tests/database/deferred-effects.test.sql", "utf8"),
  ].join("\n");
  const pgTap = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8" });
  process.stdout.write(pgTap.stdout ?? "");
  process.stderr.write(pgTap.stderr ?? "");
  if (pgTap.status !== 0 || /^\s*not ok\b/m.test(pgTap.stdout ?? "")) throw new Error("La suite pgTAP a échoué.");
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;
  const app = spawnSync(process.execPath, ["tests/integration/database-command-canary.mjs"], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: databaseUrl } });
  if (app.status !== 0) throw new Error("Le canari transactionnel applicatif a échoué.");
  // Le canari outbox importe le Route Handler : il lui faut la chaîne de connexion et le
  // secret du worker, injectés ici pour rester alignés sur la base éphémère du harnais.
  const outbox = spawnSync(process.execPath, ["tests/integration/database-outbox-canary.mjs"], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl, DEFERRED_EFFECTS_WORKER_SECRET: `ci-outbox-${randomUUID()}` } });
  if (outbox.status !== 0) throw new Error("Le canari outbox transactionnel a échoué.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  spawnSync("npx", [...supabase, "stop", "--no-backup", "--workdir", workdir], { stdio: "inherit" });
  rmSync(workdir, { recursive: true, force: true });
}
