import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createBackupPoint, createFilesystemBackupStore } from "../../scripts/recovery/create-backup.mjs";
import { restoreBackupPoint } from "../../scripts/recovery/restore-backup.mjs";

const databaseFiles = ["roles.sql", "schema.sql", "data.sql", "history-schema.sql", "history-data.sql"];

const withTempDirectory = async (work) => {
  const directory = await mkdtemp(join(tmpdir(), "mbs-recovery-test-"));
  try {
    await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const makeBackup = async (root, overrides = {}) => {
  const bytes = Buffer.from("fixture-storage-object", "utf8");
  const refs = [{ bucket: "private-media", key: "sha256/fixture", version: "v1" }];
  const barrierStages = [];
  const store = createFilesystemBackupStore(root);
  const result = await createBackupPoint(
    {
      backupId: "018f0f9d-6b64-7000-8000-000000000001",
      sourceEnvironment: "local",
      sourceFingerprint: "local-mbs-v1",
      pitrAvailable: false,
      sourceDatabaseUrl: "postgresql://postgres@127.0.0.1:54322/postgres",
    },
    {
      barrier: { assertActive: async (stage) => barrierStages.push(stage) },
      database: {
        inspectVersions: async () => ({ serverMajor: 17, dumpMajor: 17, psqlMajor: 17, supabaseCliVersion: "2.101.0" }),
        exportTo: async (directory) => {
          for (const name of databaseFiles) await writeFile(join(directory, name), `-- ${name}\n`, "utf8");
          return databaseFiles;
        },
      },
      storage: {
        list: async () => refs,
        download: async () => bytes,
      },
      store,
      ...overrides,
    },
  );
  return { ...result, barrierStages, bytes, refs, store };
};

test("un point complet est finalisé seulement après exports, objets et double inventaire", async () => {
  await withTempDirectory(async (root) => {
    const result = await makeBackup(root);
    assert.deepEqual(result.barrierStages, ["before-inventory", "before-export", "before-finalize"]);
    assert.equal(result.manifest.database.length, 5);
    assert.equal(result.manifest.objects.length, 1);
    assert.equal(await readFile(join(result.pointDirectory, "FINALIZED"), "utf8"), `${result.manifestSha256}\n`);
    assert.equal(result.manifest.objects[0].archivePath, `objects/${result.manifest.objects[0].sha256}`);
    assert.doesNotMatch(JSON.stringify(result.manifest), /fixture-storage-object|postgresql:|service.role/i);
  });
});

test("une variation de l'inventaire ou une source production non protégée refuse la finalisation", async () => {
  await withTempDirectory(async (root) => {
    let calls = 0;
    await assert.rejects(
      () => makeBackup(root, {
        storage: {
          list: async () => (++calls === 1 ? [{ bucket: "private-media", key: "a", version: "v1" }] : []),
          download: async () => Buffer.from("a"),
        },
      }),
      (error) => error?.code === "RECOVERY_INVENTORY_CHANGED",
    );
  });

  await withTempDirectory(async (root) => {
    await assert.rejects(
      () => createBackupPoint(
        {
          backupId: "018f0f9d-6b64-7000-8000-000000000002",
          sourceEnvironment: "production",
          sourceFingerprint: "production-mbs-v1",
          pitrAvailable: true,
        },
        {
          barrier: { assertActive: async () => {} },
          database: { exportTo: async () => [], inspectVersions: async () => ({ serverMajor: 17, dumpMajor: 17, psqlMajor: 17, supabaseCliVersion: "2.101.0" }) },
          storage: { list: async () => [], download: async () => Buffer.alloc(0) },
          store: createFilesystemBackupStore(root),
        },
      ),
      (error) => error?.code === "RECOVERY_PRODUCTION_SOURCE_FORBIDDEN",
    );
  });
});

test("une source production exige TLS puis une destination hors site immuable", async () => {
  const baseInput = {
    backupId: "018f0f9d-6b64-7000-8000-000000000003",
    sourceEnvironment: "production",
    sourceFingerprint: "production-mbs-v1",
    pitrAvailable: true,
    executionEnvironment: "production-recovery",
  };
  const ports = (root) => ({
    barrier: { assertActive: async () => {} },
    database: { exportTo: async () => [], inspectVersions: async () => ({ serverMajor: 17, dumpMajor: 17, psqlMajor: 17, supabaseCliVersion: "2.101.0" }) },
    storage: { list: async () => [], download: async () => Buffer.alloc(0) },
    store: createFilesystemBackupStore(root),
  });
  await withTempDirectory(async (root) => {
    await assert.rejects(
      () => createBackupPoint({ ...baseInput, sourceDatabaseUrl: "postgresql://db.example.invalid/postgres" }, ports(root)),
      (error) => error?.code === "RECOVERY_REMOTE_TLS_REQUIRED",
    );
  });
  await withTempDirectory(async (root) => {
    await assert.rejects(
      () => createBackupPoint({ ...baseInput, sourceDatabaseUrl: "postgresql://db.example.invalid/postgres?sslmode=verify-full" }, ports(root)),
      (error) => error?.code === "RECOVERY_OFFSITE_REQUIRED",
    );
  });
});

test("un coffre distant immuable reçoit tous les octets puis FINALIZED en dernier", async () => {
  const entries = new Map();
  const writes = [];
  const store = {
    kind: "remote",
    async verifyRetention() { return { offsite: true, immutable: true, retentionVerified: true }; },
    async putExclusive(path, content) {
      if (entries.has(path)) throw new Error("collision");
      entries.set(path, Buffer.from(content));
      writes.push(path);
    },
    async read(path) { return entries.get(path); },
    async list(prefix) { return [...entries.keys()].filter((path) => path.startsWith(`${prefix}/`)).sort(); },
  };
  const result = await createBackupPoint({
    backupId: "018f0f9d-6b64-7000-8000-000000000004",
    sourceEnvironment: "production",
    sourceFingerprint: "production-mbs-v1",
    pitrAvailable: true,
    executionEnvironment: "production-recovery",
    sourceDatabaseUrl: "postgresql://db.example.invalid/postgres?sslmode=verify-full",
  }, {
    barrier: { assertActive: async () => {} },
    database: {
      inspectVersions: async () => ({ serverMajor: 17, dumpMajor: 17, psqlMajor: 17, supabaseCliVersion: "2.101.0" }),
      exportTo: async (directory) => {
        for (const name of databaseFiles) await writeFile(join(directory, name), name);
        return databaseFiles;
      },
    },
    storage: {
      list: async () => [{ bucket: "private", key: "object", version: "v1" }],
      download: async () => Buffer.from("object"),
    },
    store,
  });
  assert.equal(result.pointDirectory, undefined);
  assert.equal(writes.at(-1), `${result.storePrefix}/FINALIZED`);
  assert.equal(entries.get(`${result.storePrefix}/FINALIZED`).toString(), `${result.manifestSha256}\n`);
  const restored = await restoreBackupPoint({
    storePrefix: result.storePrefix,
    sourceFingerprint: "production-mbs-v1",
    targetEnvironment: "production-recovery",
    targetFingerprint: "production-recovery-mbs-v1",
  }, {
    store,
    proofStore: store,
    database: {
      assertDisposableTarget: async () => true,
      restoreFrom: async (files) => assert.equal(files.length, 5),
      verify: async () => ({ dataVerified: true, authVerified: true, rlsVerified: true, migrationsVerified: true }),
    },
    storage: {
      put: async () => ({ metadataVerified: true }),
      list: async () => [{ bucket: "private", key: "object", version: "restored" }],
      download: async () => Buffer.from("object"),
    },
    cleanupTarget: async () => {},
  });
  assert.equal(restored.proof.verdict, "passed");
  assert.ok(writes.at(-1).includes("/proofs/"));
});

test("une mutation sous la même clé et une version PostgreSQL incompatible bloquent le point", async () => {
  await withTempDirectory(async (root) => {
    let call = 0;
    await assert.rejects(
      () => makeBackup(root, { storage: {
        list: async () => [{ bucket: "private-media", key: "sha256/fixture", version: ++call === 1 ? "v1" : "v2" }],
        download: async () => Buffer.from("fixture-storage-object"),
      } }),
      (error) => error?.code === "RECOVERY_INVENTORY_CHANGED",
    );
  });
  await withTempDirectory(async (root) => {
    await assert.rejects(
      () => makeBackup(root, { database: {
        inspectVersions: async () => ({ serverMajor: 17, dumpMajor: 16, psqlMajor: 17, supabaseCliVersion: "2.101.0" }),
        exportTo: async () => assert.fail(),
      } }),
      (error) => error?.code === "RECOVERY_TOOL_VERSION_INCOMPATIBLE",
    );
  });
});

test("la restauration vérifie DB et Storage puis conserve une preuve expurgée", async () => {
  await withTempDirectory(async (root) => {
    const backup = await makeBackup(root);
    const restored = [];
    let cleaned = false;
    const proofPath = join(root, "proof.json");
    const result = await restoreBackupPoint(
      {
        pointDirectory: backup.pointDirectory,
        sourceFingerprint: "local-mbs-v1",
        targetEnvironment: "local",
        targetFingerprint: "local-restore-mbs-v1",
        proofPath,
      },
      {
        database: {
          assertDisposableTarget: async () => true,
          restoreFrom: async (files) => assert.equal(files.length, 5),
          verify: async () => ({ dataVerified: true, authVerified: true, rlsVerified: true, migrationsVerified: true }),
        },
        storage: {
          put: async (reference, bytes) => { restored.push({ reference, bytes }); return { metadataVerified: true }; },
          list: async () => backup.refs,
          download: async () => backup.bytes,
        },
        cleanupTarget: async () => { cleaned = true; },
      },
    );
    assert.equal(result.proof.verdict, "passed");
    assert.equal(restored.length, 1);
    assert.equal(cleaned, true);
    const proofText = await readFile(proofPath, "utf8");
    assert.doesNotMatch(proofText, /private-media|sha256\/fixture|fixture-storage-object/);
  });
});

test("une corruption Storage produit une preuve failed et détruit la cible", async () => {
  await withTempDirectory(async (root) => {
    const backup = await makeBackup(root);
    const proofPath = join(root, "failed-proof.json");
    let cleaned = false;
    await assert.rejects(
      () => restoreBackupPoint(
        {
          pointDirectory: backup.pointDirectory,
          sourceFingerprint: "local-mbs-v1",
          targetEnvironment: "local",
          targetFingerprint: "local-restore-mbs-v1",
          proofPath,
        },
        {
          database: { assertDisposableTarget: async () => true, restoreFrom: async () => {}, verify: async () => ({ dataVerified: true, authVerified: true, rlsVerified: true, migrationsVerified: true }) },
          storage: {
            put: async () => ({ metadataVerified: true }),
            list: async () => backup.refs,
            download: async () => Buffer.from("corrompu"),
          },
          cleanupTarget: async () => { cleaned = true; },
        },
      ),
      (error) => error?.code === "RECOVERY_OBJECT_HASH_MISMATCH",
    );
    assert.equal(cleaned, true);
    const proof = JSON.parse(await readFile(proofPath, "utf8"));
    assert.equal(proof.verdict, "failed");
    assert.deepEqual(proof.errorCodes, ["RECOVERY_OBJECT_HASH_MISMATCH"]);
  });
});

test("la restauration refuse un fingerprint source incohérent", async () => {
  await withTempDirectory(async (root) => {
    const backup = await makeBackup(root);
    let cleaned = false;
    await assert.rejects(
      () => restoreBackupPoint(
        {
          pointDirectory: backup.pointDirectory,
          sourceFingerprint: "autre-source-v1",
          targetEnvironment: "local",
          targetFingerprint: "local-restore-mbs-v1",
          proofPath: join(root, "boundary-proof.json"),
        },
        {
          database: { assertDisposableTarget: async () => assert.fail(), restoreFrom: async () => assert.fail(), verify: async () => assert.fail() },
          storage: { put: async () => assert.fail(), list: async () => [], download: async () => Buffer.alloc(0) },
          cleanupTarget: async () => { cleaned = true; },
        },
      ),
      (error) => error?.code === "RECOVERY_SOURCE_FINGERPRINT_MISMATCH",
    );
    assert.equal(cleaned, false);
  });
});

test("une cible non attestée et un contrôle DB faux ne peuvent produire passed", async () => {
  await withTempDirectory(async (root) => {
    const backup = await makeBackup(root);
    const basePorts = {
      storage: {
        put: async () => ({ metadataVerified: true }),
        list: async () => backup.refs,
        download: async () => backup.bytes,
      },
      cleanupTarget: async () => {},
    };
    await assert.rejects(
      () => restoreBackupPoint({
        pointDirectory: backup.pointDirectory,
        sourceFingerprint: "local-mbs-v1",
        targetEnvironment: "local",
        targetFingerprint: "local-restore-mbs-v1",
        proofPath: join(root, "attestation-proof.json"),
      }, {
        ...basePorts,
        database: { assertDisposableTarget: async () => { throw Object.assign(new Error(), { code: "RECOVERY_TARGET_NOT_DISPOSABLE" }); }, restoreFrom: async () => assert.fail(), verify: async () => assert.fail() },
      }),
      (error) => error?.code === "RECOVERY_TARGET_NOT_DISPOSABLE",
    );
    await assert.rejects(
      () => restoreBackupPoint({
        pointDirectory: backup.pointDirectory,
        sourceFingerprint: "local-mbs-v1",
        targetEnvironment: "local",
        targetFingerprint: "local-restore-mbs-v1",
        proofPath: join(root, "checks-proof.json"),
      }, {
        ...basePorts,
        database: { assertDisposableTarget: async () => true, restoreFrom: async () => {}, verify: async () => ({ dataVerified: true, authVerified: true, rlsVerified: false, migrationsVerified: true }) },
      }),
      (error) => error?.code === "RECOVERY_DATABASE_CHECKS_FAILED",
    );
  });
});
