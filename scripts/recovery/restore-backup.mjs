import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";

import { canonicalizeManifest, sha256Bytes, validateManifest, verifyBackupPoint } from "./manifest.mjs";
import { RecoveryOperationError } from "./create-backup.mjs";

const normalizeInventory = (items) => [...items]
  .map(({ bucket, key }) => ({ bucket, key }))
  .sort((left, right) => left.bucket.localeCompare(right.bucket) || left.key.localeCompare(right.key));

const DATABASE_CHECK_FIELDS = ["dataVerified", "authVerified", "rlsVerified", "migrationsVerified"];

const writeProof = async (input, ports, proof) => {
  const payload = `${JSON.stringify(proof)}\n`;
  if (input.proofPath) {
    await mkdir(dirname(input.proofPath), { recursive: true });
    await writeFile(input.proofPath, payload, { encoding: "utf8", flag: "wx" });
  }
  if (ports.proofStore) {
    if (input.targetEnvironment === "production-recovery") {
      const capabilities = await ports.proofStore.verifyRetention?.();
      if (!capabilities?.offsite || !capabilities?.immutable || !capabilities?.retentionVerified) {
        throw new RecoveryOperationError("RECOVERY_IMMUTABLE_PROOF_STORE_REQUIRED");
      }
    }
    await ports.proofStore.putExclusive(`${proof.backupId}/proofs/${proof.drillId}.json`, payload);
  } else if (input.targetEnvironment === "production-recovery") {
    throw new RecoveryOperationError("RECOVERY_IMMUTABLE_PROOF_STORE_REQUIRED");
  }
};

const assertDatabaseChecks = (checks) => {
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) throw new RecoveryOperationError("RECOVERY_DATABASE_CHECKS_FAILED");
  if (Object.keys(checks).sort().join("\0") !== [...DATABASE_CHECK_FIELDS].sort().join("\0")) {
    throw new RecoveryOperationError("RECOVERY_DATABASE_CHECKS_FAILED");
  }
  if (DATABASE_CHECK_FIELDS.some((field) => checks[field] !== true)) throw new RecoveryOperationError("RECOVERY_DATABASE_CHECKS_FAILED");
  return checks;
};

const materializeRemotePoint = async (input, store) => {
  if (!input.storePrefix || !store?.read) throw new RecoveryOperationError("RECOVERY_POINT_LOCATION_REQUIRED");
  const directory = await mkdtemp(join(tmpdir(), "mbs-restore-"));
  try {
    const copy = async (path) => {
      const destination = join(directory, ...path.split("/"));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await store.read(`${input.storePrefix}/${path}`), { flag: "wx" });
    };
    await copy("manifest.json");
    await copy("manifest.sha256");
    await copy("FINALIZED");
    const manifest = validateManifest(JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")));
    for (const path of [
      ...manifest.database.map(({ path }) => path),
      ...new Set(manifest.objects.map(({ archivePath }) => archivePath)),
    ]) await copy(path);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

export const restoreBackupPoint = async (input, ports) => {
  const started = ports.now?.() ?? new Date();
  let manifest;
  let manifestSha256;
  let databaseChecks = {};
  let storageChecks = { objects: 0 };
  const drillId = ports.createId?.() ?? randomUUID();
  let temporaryPoint = false;
  let targetAttested = false;
  let targetCleaned = false;
  let pointDirectory = input.pointDirectory;
  const baseProof = () => ({
    schemaVersion: 1,
    drillId,
    backupId: manifest?.backupId ?? "unknown",
    startedAt: started.toISOString(),
    completedAt: (ports.now?.() ?? new Date()).toISOString(),
    sourceEnvironment: manifest?.sourceEnvironment ?? "unknown",
    sourceFingerprint: input.sourceFingerprint,
    targetFingerprint: input.targetFingerprint,
    manifestSha256: manifestSha256 ?? "unknown",
    toolVersions: manifest ? { postgresMajor: manifest.postgresMajor, supabaseCliVersion: manifest.supabaseCliVersion } : {},
    databaseChecks,
    storageChecks,
    durationMs: Math.max(0, (ports.now?.() ?? new Date()).getTime() - started.getTime()),
  });

  try {
    if (input.targetEnvironment === "production") throw new RecoveryOperationError("RECOVERY_PRODUCTION_TARGET_FORBIDDEN");
    if (!input.sourceFingerprint || !input.targetFingerprint || input.sourceFingerprint === input.targetFingerprint) {
      throw new RecoveryOperationError("RECOVERY_TARGET_NOT_ISOLATED");
    }
    if (
      !ports?.database?.restoreFrom || !ports?.database?.verify || !ports?.database?.assertDisposableTarget ||
      !ports?.storage?.put || !ports?.storage?.list || !ports?.storage?.download || typeof ports.cleanupTarget !== "function"
    ) {
      throw new RecoveryOperationError("RECOVERY_INVALID_PORTS");
    }
    if (!pointDirectory) {
      pointDirectory = await materializeRemotePoint(input, ports.store);
      temporaryPoint = true;
    }

    manifest = validateManifest(JSON.parse(await readFile(join(pointDirectory, "manifest.json"), "utf8")));
    if (manifest.sourceFingerprint !== input.sourceFingerprint) {
      throw new RecoveryOperationError("RECOVERY_SOURCE_FINGERPRINT_MISMATCH");
    }
    if (manifest.sourceEnvironment === "production" && input.targetEnvironment !== "production-recovery") {
      throw new RecoveryOperationError("RECOVERY_PRODUCTION_DATA_BOUNDARY_VIOLATION");
    }
    manifestSha256 = (await readFile(join(pointDirectory, "manifest.sha256"), "utf8")).trim();
    const finalized = (await readFile(join(pointDirectory, "FINALIZED"), "utf8")).trim();
    if (finalized !== manifestSha256) throw new RecoveryOperationError("RECOVERY_POINT_NOT_FINALIZED");
    await verifyBackupPoint({
      rootDir: pointDirectory,
      manifest,
      manifestSha256,
      inventory: manifest.objects.map(({ bucket, key }) => ({ bucket, key })),
    });
    if (sha256Bytes(Buffer.from(canonicalizeManifest(manifest))) !== manifestSha256) {
      throw new RecoveryOperationError("RECOVERY_MANIFEST_DIGEST_MISMATCH");
    }

    await ports.database.assertDisposableTarget(input.targetFingerprint, input.targetEnvironment);
    targetAttested = true;
    await ports.database.restoreFrom(manifest.database.map(({ path }) => join(pointDirectory, ...path.split("/"))));
    let metadataVerified = true;
    for (const object of manifest.objects) {
      const bytes = await readFile(join(pointDirectory, ...object.archivePath.split("/")));
      const result = await ports.storage.put({ bucket: object.bucket, key: object.key }, bytes, { reconcileMetadata: true });
      metadataVerified = metadataVerified && result?.metadataVerified === true;
    }

    const expectedInventory = normalizeInventory(manifest.objects);
    const actualInventory = normalizeInventory(await ports.storage.list());
    if (JSON.stringify(expectedInventory) !== JSON.stringify(actualInventory)) {
      throw new RecoveryOperationError("RECOVERY_TARGET_INVENTORY_MISMATCH");
    }
    for (const object of manifest.objects) {
      const restored = Buffer.from(await ports.storage.download({ bucket: object.bucket, key: object.key }));
      if (restored.byteLength !== object.bytes || sha256Bytes(restored) !== object.sha256) {
        throw new RecoveryOperationError("RECOVERY_OBJECT_HASH_MISMATCH");
      }
    }
    storageChecks = {
      objects: manifest.objects.length,
      hashesVerified: true,
      metadataVerified,
      referencesVerified: true,
    };
    if (!metadataVerified) throw new RecoveryOperationError("RECOVERY_STORAGE_METADATA_MISMATCH");
    databaseChecks = assertDatabaseChecks(await ports.database.verify());
    try {
      await ports.cleanupTarget();
      targetCleaned = true;
    } catch (error) {
      throw new RecoveryOperationError("RECOVERY_TARGET_CLEANUP_FAILED", "RECOVERY_TARGET_CLEANUP_FAILED", { cause: error });
    }
    const proof = { ...baseProof(), verdict: "passed", errorCodes: [] };
    if (temporaryPoint) await rm(pointDirectory, { recursive: true, force: true });
    await writeProof(input, ports, proof);
    return { manifest, proof };
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "RECOVERY_RESTORE_FAILED";
    let cleanupFailed = false;
    if (targetAttested && !targetCleaned) {
      try {
        await ports.cleanupTarget?.();
      } catch {
        cleanupFailed = true;
      }
    }
    const proof = {
      ...baseProof(),
      verdict: "failed",
      errorCodes: [...new Set(cleanupFailed ? [code, "RECOVERY_TARGET_CLEANUP_FAILED"] : [code])],
    };
    if (temporaryPoint && pointDirectory) await rm(pointDirectory, { recursive: true, force: true }).catch(() => {});
    await writeProof(input, ports, proof);
    if (cleanupFailed) throw new RecoveryOperationError("RECOVERY_TARGET_CLEANUP_FAILED", "RECOVERY_TARGET_CLEANUP_FAILED", { cause: error });
    if (error?.code) throw error;
    throw new RecoveryOperationError(code, code, { cause: error });
  }
};
