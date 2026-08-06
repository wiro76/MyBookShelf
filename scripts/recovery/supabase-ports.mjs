import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import { RecoveryOperationError } from "./create-backup.mjs";

const { Client } = pg;
const CLI_VERSION = "2.101.0";
const useShell = process.platform === "win32";

const escapeCmdArgument = (value) => {
  let escaped = String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  escaped = `"${escaped}"`;
  return escaped.replace(/[()%!^"<>&|]/g, "^$&");
};
const quote = (value) => (useShell ? escapeCmdArgument(value) : String(value));

const run = (command, args, options = {}) => {
  const shell = useShell && command === "npx";
  const result = spawnSync(command, args.map((value) => (shell ? quote(value) : String(value))), {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell,
    ...options,
  });
  if (result.status !== 0) {
    const diagnostic = String(result.stderr ?? "").slice(-4_000);
    if (diagnostic) process.stderr.write(diagnostic);
    throw new RecoveryOperationError(
      "RECOVERY_PROCESS_FAILED",
      `RECOVERY_PROCESS_FAILED:${command}:${result.status ?? result.error?.code ?? "unknown"}`,
    );
  }
  return result.stdout ?? "";
};

const postgresMajor = (output) => {
  const match = String(output).match(/(?:PostgreSQL\)?\s+)?(\d+)(?:\.\d+)?/i);
  if (!match) throw new RecoveryOperationError("RECOVERY_TOOL_VERSION_UNREADABLE");
  return Number(match[1]);
};

export const createSupabaseDatabasePort = ({
  sourceDatabaseUrl,
  sourceContainer,
  targetContainer,
  targetFingerprint,
  assertTarget,
  verifyTarget,
}) => ({
  async inspectVersions() {
    const connection = new Client({ connectionString: sourceDatabaseUrl });
    await connection.connect();
    let serverMajor;
    try {
      const result = await connection.query("show server_version_num");
      serverMajor = Math.floor(Number(result.rows[0].server_version_num) / 10_000);
    } finally {
      await connection.end();
    }
    return {
      serverMajor,
      dumpMajor: postgresMajor(run("docker", ["exec", sourceContainer, "pg_dump", "--version"])),
      psqlMajor: postgresMajor(run("docker", ["exec", targetContainer, "psql", "--version"])),
      supabaseCliVersion: CLI_VERSION,
    };
  },

  async assertDisposableTarget(expectedFingerprint, targetEnvironment) {
    if (expectedFingerprint !== targetFingerprint || !new Set(["local", "preview", "staging", "production-recovery"]).has(targetEnvironment)) {
      throw new RecoveryOperationError("RECOVERY_TARGET_ATTESTATION_FAILED");
    }
    if (typeof assertTarget !== "function" || await assertTarget() !== true) {
      throw new RecoveryOperationError("RECOVERY_TARGET_NOT_DISPOSABLE");
    }
  },

  async exportTo(directory) {
    await mkdir(directory, { recursive: true });
    const dump = (name, extra) => run("npx", [
      "--yes", `supabase@${CLI_VERSION}`, "db", "dump", "--db-url", sourceDatabaseUrl,
      "-f", join(directory, name), ...extra,
    ]);
    dump("roles.sql", ["--role-only"]);
    dump("schema.sql", []);
    dump("data.sql", ["--use-copy", "--data-only", "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes"]);
    dump("history-schema.sql", ["--schema", "supabase_migrations"]);
    dump("history-data.sql", ["--use-copy", "--data-only", "--schema", "supabase_migrations"]);

    return ["roles.sql", "schema.sql", "data.sql", "history-schema.sql", "history-data.sql"];
  },

  async restoreFrom(files) {
    const byName = new Map(files.map((path) => [path.replaceAll("\\", "/").split("/").at(-1), path]));
    const { readFile } = await import("node:fs/promises");
    const sql = [
      "drop schema if exists recovery_canary cascade;",
      "truncate table auth.identities, auth.users, storage.objects, storage.buckets cascade;",
      "drop schema if exists supabase_migrations cascade;",
      await readFile(byName.get("roles.sql"), "utf8"),
      await readFile(byName.get("schema.sql"), "utf8"),
      "set session_replication_role = replica;",
      await readFile(byName.get("data.sql"), "utf8"),
      await readFile(byName.get("history-schema.sql"), "utf8"),
      await readFile(byName.get("history-data.sql"), "utf8"),
    ].join("\n");
    run("docker", [
      "exec", "-i", targetContainer, "psql", "-X", "--single-transaction",
      "--set", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
    ], { input: sql });
  },

  async verify() {
    if (typeof verifyTarget !== "function") throw new RecoveryOperationError("RECOVERY_DATABASE_VERIFY_MISSING");
    return verifyTarget();
  },
});

export const createSupabaseStoragePort = ({ apiUrl, serviceRoleKey, databaseUrl, reconcileMetadata = false }) => {
  const client = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const query = async (text, values = []) => {
    const connection = new Client({ connectionString: databaseUrl });
    await connection.connect();
    try {
      return await connection.query(text, values);
    } finally {
      await connection.end();
    }
  };
  return {
    async list() {
      const result = await query(`
        select bucket_id as bucket, name as key,
          coalesce(updated_at::text, '') || ':' || md5(coalesce(metadata::text, '')) as version
        from storage.objects
        order by bucket_id, name
      `);
      return result.rows;
    },
    async download({ bucket, key }) {
      const { data, error } = await client.storage.from(bucket).download(key);
      if (error) throw new RecoveryOperationError("RECOVERY_STORAGE_DOWNLOAD_FAILED");
      return Buffer.from(await data.arrayBuffer());
    },
    async put({ bucket, key }, bytes) {
      let preservedMetadata = null;
      if (reconcileMetadata) {
        const snapshot = await query(`
          select metadata, user_metadata, owner::text as owner, owner_id
          from storage.objects where bucket_id = $1 and name = $2
        `, [bucket, key]);
        if (snapshot.rowCount !== 1) throw new RecoveryOperationError("RECOVERY_STORAGE_METADATA_MISSING");
        preservedMetadata = snapshot.rows[0];
        const { error } = await client.storage.from(bucket).remove([key]);
        if (error) throw new RecoveryOperationError("RECOVERY_STORAGE_RECONCILE_FAILED");
      }
      const { error } = await client.storage.from(bucket).upload(key, bytes, {
        upsert: true,
        contentType: preservedMetadata?.metadata?.mimetype ?? "application/octet-stream",
        cacheControl: preservedMetadata?.metadata?.cacheControl,
      });
      if (error) throw new RecoveryOperationError("RECOVERY_STORAGE_UPLOAD_FAILED");
      if (!preservedMetadata) return { metadataVerified: true };
      await query(`
        update storage.objects
        set metadata = $3::jsonb, user_metadata = $4::jsonb, owner = $5::uuid, owner_id = $6
        where bucket_id = $1 and name = $2
      `, [
        bucket,
        key,
        preservedMetadata.metadata,
        preservedMetadata.user_metadata,
        preservedMetadata.owner,
        preservedMetadata.owner_id,
      ]);
      const restored = await query(`
        select metadata, user_metadata, owner::text as owner, owner_id
        from storage.objects where bucket_id = $1 and name = $2
      `, [bucket, key]);
      return { metadataVerified: JSON.stringify(restored.rows[0]) === JSON.stringify(preservedMetadata) };
    },
  };
};

export const recoveryCliVersion = CLI_VERSION;
