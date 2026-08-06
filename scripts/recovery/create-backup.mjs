import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, relative, resolve } from "node:path";

import { canonicalizeManifest, sha256Bytes, sha256File, validateManifest, verifyBackupPoint } from "./manifest.mjs";
import { selectPlatformBackupMode } from "./policy.mjs";

const REQUIRED_DATABASE_FILES = ["roles.sql", "schema.sql", "data.sql", "history-schema.sql", "history-data.sql"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RecoveryOperationError extends Error {
  constructor(code, message = code, options) {
    super(message, options);
    this.name = "RecoveryOperationError";
    this.code = code;
  }
}

const safeStorePath = (root, path) => {
  if (typeof path !== "string" || path.length === 0 || path.includes("\\") || posix.isAbsolute(path)) {
    throw new RecoveryOperationError("RECOVERY_UNSAFE_STORE_PATH");
  }
  const normalized = posix.normalize(path);
  if (normalized === ".." || normalized.startsWith("../") || normalized !== path) {
    throw new RecoveryOperationError("RECOVERY_UNSAFE_STORE_PATH");
  }
  const absolute = resolve(root, ...path.split("/"));
  const withinRoot = relative(resolve(root), absolute);
  if (withinRoot.startsWith("..") || resolve(root) === absolute) throw new RecoveryOperationError("RECOVERY_UNSAFE_STORE_PATH");
  return absolute;
};

export const createFilesystemBackupStore = (rootDirectory) => {
  const root = resolve(rootDirectory);
  return {
    kind: "filesystem",
    rootDirectory: root,
    async putExclusive(path, content) {
      const absolute = safeStorePath(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content, { flag: "wx" });
    },
    async read(path) {
      return readFile(safeStorePath(root, path));
    },
    async list(prefix) {
      const base = safeStorePath(root, prefix);
      const entries = [];
      const visit = async (directory) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const absolute = join(directory, entry.name);
          if (entry.isSymbolicLink()) throw new RecoveryOperationError("RECOVERY_STORE_SYMLINK_FORBIDDEN");
          if (entry.isDirectory()) await visit(absolute);
          else entries.push(relative(root, absolute).replaceAll("\\", "/"));
        }
      };
      await visit(base);
      return entries.sort();
    },
    async verifyRetention() {
      return { offsite: false, immutable: false, retentionVerified: false };
    },
    async removePrefix(prefix) {
      await rm(safeStorePath(root, prefix), { recursive: true, force: true });
    },
  };
};

const normalizeInventory = (inventory) => {
  if (!Array.isArray(inventory)) throw new RecoveryOperationError("RECOVERY_INVALID_INVENTORY");
  const normalized = inventory.map((item) => {
    if (
      !item || typeof item.bucket !== "string" || item.bucket.length === 0 ||
      typeof item.key !== "string" || item.key.length === 0 ||
      typeof item.version !== "string" || item.version.length === 0
    ) {
      throw new RecoveryOperationError("RECOVERY_INVALID_INVENTORY");
    }
    return { bucket: item.bucket, key: item.key, version: item.version };
  }).sort((left, right) => left.bucket.localeCompare(right.bucket) || left.key.localeCompare(right.key));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].bucket === normalized[index].bucket && normalized[index - 1].key === normalized[index].key) {
      throw new RecoveryOperationError("RECOVERY_DUPLICATE_REFERENCE");
    }
  }
  return normalized;
};

const sameInventory = (left, right) => JSON.stringify(normalizeInventory(left)) === JSON.stringify(normalizeInventory(right));

export const createBackupPoint = async (input, ports) => {
  const {
    backupId, sourceEnvironment, sourceFingerprint, pitrAvailable, executionEnvironment, sourceDatabaseUrl,
  } = input;
  if (!UUID_PATTERN.test(backupId ?? "")) throw new RecoveryOperationError("RECOVERY_INVALID_BACKUP_ID");
  if (
    !ports?.barrier?.assertActive || !ports?.database?.exportTo || !ports?.database?.inspectVersions ||
    !ports?.storage?.list || !ports?.storage?.download || !ports?.store?.putExclusive ||
    !ports?.store?.read || !ports?.store?.list || !ports?.store?.verifyRetention
  ) {
    throw new RecoveryOperationError("RECOVERY_INVALID_PORTS");
  }
  const platformBackupMode = selectPlatformBackupMode({ pitrAvailable });
  let databaseUrl;
  if (sourceDatabaseUrl !== undefined) {
    try {
      databaseUrl = new URL(sourceDatabaseUrl);
    } catch {
      throw new RecoveryOperationError("RECOVERY_DATABASE_URL_INVALID");
    }
    if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
      throw new RecoveryOperationError("RECOVERY_DATABASE_URL_INVALID");
    }
    const loopback = databaseUrl.hostname === "localhost" || databaseUrl.hostname === "::1" || /^127(?:\.\d{1,3}){3}$/.test(databaseUrl.hostname);
    if (!loopback && !new Set(["require", "verify-ca", "verify-full"]).has(databaseUrl.searchParams.get("sslmode"))) {
      throw new RecoveryOperationError("RECOVERY_REMOTE_TLS_REQUIRED");
    }
  }
  if (sourceEnvironment === "production") {
    if (executionEnvironment !== "production-recovery") {
      throw new RecoveryOperationError("RECOVERY_PRODUCTION_SOURCE_FORBIDDEN");
    }
    if (!databaseUrl || !new Set(["require", "verify-ca", "verify-full"]).has(databaseUrl.searchParams.get("sslmode"))) {
      throw new RecoveryOperationError("RECOVERY_PRODUCTION_TLS_REQUIRED");
    }
  }
  const versions = await ports.database.inspectVersions();
  if (
    !versions || versions.serverMajor !== 17 || versions.dumpMajor < versions.serverMajor ||
    versions.psqlMajor < versions.serverMajor || versions.supabaseCliVersion !== "2.101.0"
  ) {
    throw new RecoveryOperationError("RECOVERY_TOOL_VERSION_INCOMPATIBLE");
  }
  const capabilities = await ports.store.verifyRetention();
  if (sourceEnvironment === "production" && (!capabilities?.offsite || !capabilities?.immutable || !capabilities?.retentionVerified || ports.store.kind === "filesystem")) {
    throw new RecoveryOperationError("RECOVERY_OFFSITE_REQUIRED");
  }

  const prefix = backupId;
  const remoteStore = ports.store.kind !== "filesystem";
  const pointDirectory = remoteStore
    ? await mkdtemp(join(tmpdir(), `mbs-recovery-${backupId}-`))
    : safeStorePath(ports.store.rootDirectory, prefix);
  let pointCreated = false;
  try {
    if (!remoteStore) {
      await mkdir(pointDirectory, { recursive: false });
      pointCreated = true;
    }
    await mkdir(join(pointDirectory, "database"), { recursive: true });
    await mkdir(join(pointDirectory, "objects"), { recursive: true });

    await ports.barrier.assertActive("before-inventory");
    const inventoryBefore = normalizeInventory(await ports.storage.list());
    await ports.barrier.assertActive("before-export");

    const exported = await ports.database.exportTo(join(pointDirectory, "database"));
    const exportedNames = [...exported].sort();
    if (JSON.stringify(exportedNames) !== JSON.stringify([...REQUIRED_DATABASE_FILES].sort())) {
      throw new RecoveryOperationError("RECOVERY_DATABASE_EXPORT_INCOMPLETE");
    }

    const database = [];
    for (const name of REQUIRED_DATABASE_FILES) {
      const path = `database/${name}`;
      const absolute = safeStorePath(pointDirectory, path);
      const bytes = (await readFile(absolute)).byteLength;
      database.push({ path, sha256: await sha256File(absolute), bytes });
    }

    const objects = [];
    for (const reference of inventoryBefore) {
      const content = Buffer.from(await ports.storage.download(reference));
      const sha256 = sha256Bytes(content);
      const archivePath = `objects/${sha256}`;
      const absolute = safeStorePath(pointDirectory, archivePath);
      try {
        await writeFile(absolute, content, { flag: "wx" });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (sha256Bytes(await readFile(absolute)) !== sha256) throw new RecoveryOperationError("RECOVERY_OBJECT_COLLISION");
      }
      objects.push({ bucket: reference.bucket, key: reference.key, archivePath, sha256, bytes: content.byteLength });
    }

    await ports.barrier.assertActive("before-finalize");
    const inventoryAfter = normalizeInventory(await ports.storage.list());
    if (!sameInventory(inventoryBefore, inventoryAfter)) throw new RecoveryOperationError("RECOVERY_INVENTORY_CHANGED");

    const manifest = validateManifest({
      schemaVersion: 1,
      backupId,
      createdAt: (ports.now?.() ?? new Date()).toISOString(),
      sourceEnvironment,
      sourceFingerprint,
      platformBackupMode,
      postgresMajor: versions.serverMajor,
      supabaseCliVersion: versions.supabaseCliVersion,
      database,
      objects,
    });
    const manifestText = canonicalizeManifest(manifest);
    const manifestSha256 = sha256Bytes(Buffer.from(manifestText));
    await writeFile(join(pointDirectory, "manifest.json"), manifestText, { flag: "wx" });
    await writeFile(join(pointDirectory, "manifest.sha256"), `${manifestSha256}\n`, { flag: "wx" });
    await verifyBackupPoint({ rootDir: pointDirectory, manifest, manifestSha256, inventory: inventoryAfter });
    if (remoteStore) {
      const payloadPaths = [
        ...manifest.database.map(({ path }) => path),
        ...new Set(manifest.objects.map(({ archivePath }) => archivePath)),
        "manifest.json",
        "manifest.sha256",
      ];
      for (const path of payloadPaths) {
        await ports.store.putExclusive(`${prefix}/${path}`, await readFile(join(pointDirectory, ...path.split("/"))));
      }
      for (const path of payloadPaths) {
        const local = await readFile(join(pointDirectory, ...path.split("/")));
        const remote = Buffer.from(await ports.store.read(`${prefix}/${path}`));
        if (local.byteLength !== remote.byteLength || sha256Bytes(local) !== sha256Bytes(remote)) {
          throw new RecoveryOperationError("RECOVERY_REMOTE_STORE_VERIFICATION_FAILED");
        }
      }
      const expected = payloadPaths.map((path) => `${prefix}/${path}`).sort();
      if (JSON.stringify(await ports.store.list(prefix)) !== JSON.stringify(expected)) {
        throw new RecoveryOperationError("RECOVERY_REMOTE_STORE_INVENTORY_MISMATCH");
      }
      const finalCapabilities = await ports.store.verifyRetention();
      if (!finalCapabilities?.offsite || !finalCapabilities?.immutable || !finalCapabilities?.retentionVerified) {
        throw new RecoveryOperationError("RECOVERY_OFFSITE_REQUIRED");
      }
      await ports.store.putExclusive(`${prefix}/FINALIZED`, `${manifestSha256}\n`);
      await rm(pointDirectory, { recursive: true, force: true });
      return { pointDirectory: undefined, storePrefix: prefix, manifest, manifestSha256 };
    }
    await writeFile(join(pointDirectory, "FINALIZED"), `${manifestSha256}\n`, { flag: "wx" });
    return { pointDirectory, storePrefix: prefix, manifest, manifestSha256 };
  } catch (error) {
    if (pointCreated) await ports.store.removePrefix(prefix).catch(() => {});
    if (remoteStore) await rm(pointDirectory, { recursive: true, force: true }).catch(() => {});
    if (error?.code) throw error;
    throw new RecoveryOperationError("RECOVERY_BACKUP_FAILED", "RECOVERY_BACKUP_FAILED", { cause: error });
  }
};
