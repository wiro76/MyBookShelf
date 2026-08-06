import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const reservePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return reject(new Error("RECOVERY_PORT_UNAVAILABLE"));
    server.close(() => resolve(address.port));
  });
});
const ports = await Promise.all(Array.from({ length: 6 }, reservePort));
const root = mkdtempSync(join(tmpdir(), "my-bookshelf-recovery-"));
const useShell = process.platform === "win32";
const supabase = ["--yes", "supabase@2.101.0"];

const escapeCmdArgument = (value) => {
  let escaped = String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  escaped = `"${escaped}"`;
  return escaped.replace(/[()%!^"<>&|]/g, "^$&");
};
const quote = (value) => (useShell ? escapeCmdArgument(value) : String(value));

const createStack = (name, offset, withMigrations) => {
  const workdir = join(root, name);
  cpSync("supabase", join(workdir, "supabase"), { recursive: true });
  if (!withMigrations) rmSync(join(workdir, "supabase", "migrations"), { recursive: true, force: true });
  const projectId = `mbs-recovery-${name}-${process.pid}-${Date.now()}`;
  const configPath = join(workdir, "supabase", "config.toml");
  const config = readFileSync(configPath, "utf8")
    .replace(/project_id = ".*"/, `project_id = "${projectId}"`)
    .replace(/port = 54321/, `port = ${ports[offset]}`)
    .replace(/port = 54322/, `port = ${ports[offset + 1]}`)
    .replace(/shadow_port = 54320/, `shadow_port = ${ports[offset + 2]}`);
  writeFileSync(configPath, config);
  return {
    name,
    workdir,
    projectId,
    apiUrl: `http://127.0.0.1:${ports[offset]}`,
    databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${ports[offset + 1]}/postgres`,
  };
};
const source = createStack("source", 0, true);
const target = createStack("target", 3, false);

const invoke = (stack, args, { capture = false } = {}) => {
  const result = spawnSync("npx", [...supabase, ...args, "--workdir", quote(stack.workdir)], {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? "pipe" : "inherit",
    maxBuffer: 16 * 1024 * 1024,
    shell: useShell,
  });
  if (result.status !== 0) throw new Error(`RECOVERY_SUPABASE_FAILED:${stack.name}:${args[0]}`);
  return result.stdout ?? "";
};
const credentials = (stack) => {
  const output = invoke(stack, ["status", "-o", "json"], { capture: true });
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`RECOVERY_STATUS_INVALID:${stack.name}`);
  const status = JSON.parse(output.slice(start, end + 1));
  const anonKey = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!anonKey || !serviceRoleKey || anonKey === serviceRoleKey) throw new Error(`RECOVERY_KEYS_INVALID:${stack.name}`);
  return { anonKey, serviceRoleKey };
};
const stop = (stack) => {
  const result = spawnSync("npx", [...supabase, "stop", "--no-backup", "--workdir", quote(stack.workdir)], {
    stdio: "inherit",
    shell: useShell,
  });
  if (result.status !== 0) process.stderr.write(`RECOVERY_CLEANUP_WARNING:${stack.name}\n`);
};

try {
  const excluded = "studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta,realtime";
  invoke(source, ["start", "--exclude", excluded], { capture: true });
  invoke(target, ["start", "--exclude", excluded], { capture: true });
  const sourceKeys = credentials(source);
  const targetKeys = credentials(target);
  const canary = spawnSync(process.execPath, ["tests/integration/recovery-drill-canary.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      RECOVERY_SOURCE_DATABASE_URL: source.databaseUrl,
      RECOVERY_SOURCE_API_URL: source.apiUrl,
      RECOVERY_SOURCE_SERVICE_ROLE_KEY: sourceKeys.serviceRoleKey,
      RECOVERY_SOURCE_ANON_KEY: sourceKeys.anonKey,
      RECOVERY_SOURCE_CONTAINER: `supabase_db_${source.projectId}`,
      RECOVERY_TARGET_DATABASE_URL: target.databaseUrl,
      RECOVERY_TARGET_API_URL: target.apiUrl,
      RECOVERY_TARGET_SERVICE_ROLE_KEY: targetKeys.serviceRoleKey,
      RECOVERY_TARGET_ANON_KEY: targetKeys.anonKey,
      RECOVERY_TARGET_CONTAINER: `supabase_db_${target.projectId}`,
      RECOVERY_WORK_DIRECTORY: join(root, "drill"),
    },
  });
  if (canary.status !== 0) throw new Error("RECOVERY_CANARY_FAILED");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "RECOVERY_GATE_FAILED"}\n`);
  process.exitCode = 1;
} finally {
  stop(target);
  stop(source);
  rmSync(root, { recursive: true, force: true });
}
