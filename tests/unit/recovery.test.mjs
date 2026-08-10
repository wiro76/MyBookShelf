import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertBackupPointCanBeCreated,
  canonicalizeManifest,
  sha256Bytes,
  sha256File,
  validateManifest,
  verifyBackupPoint,
} from "../../scripts/recovery/manifest.mjs";
import {
  evaluateProductionPromotion,
  selectPlatformBackupMode,
  validateRecoveryPolicy,
} from "../../scripts/recovery/policy.mjs";

const HASH_A = sha256Bytes(Buffer.from("alpha"));
const HASH_B = sha256Bytes(Buffer.from("beta"));
const HASH_EMPTY = sha256Bytes(Buffer.alloc(0));
const BACKUP_ID = "018f62a0-4d4f-7abc-8def-1234567890ab";

const manifest = (overrides = {}) => ({
  schemaVersion: 1,
  backupId: BACKUP_ID,
  createdAt: "2026-08-06T10:00:00.000Z",
  sourceEnvironment: "production",
  sourceFingerprint: "prod-mbs-v1",
  platformBackupMode: "pitr",
  postgresMajor: 17,
  supabaseCliVersion: "2.101.0",
  database: [
    { path: "database/data.sql", sha256: HASH_A, bytes: 5 },
    { path: "database/history-data.sql", sha256: HASH_EMPTY, bytes: 0 },
    { path: "database/history-schema.sql", sha256: HASH_EMPTY, bytes: 0 },
    { path: "database/roles.sql", sha256: HASH_EMPTY, bytes: 0 },
    { path: "database/schema.sql", sha256: HASH_B, bytes: 4 },
  ],
  objects: [
    { bucket: "private", key: "zeta", archivePath: `objects/${HASH_B}`, sha256: HASH_B, bytes: 4 },
    { bucket: "private", key: "alpha", archivePath: `objects/${HASH_A}`, sha256: HASH_A, bytes: 5 },
  ],
  ...overrides,
});

const expectCode = (code) => (error) => error?.code === code;

test("le manifeste v1 est canonique quels que soient les ordres des clés et entrées", () => {
  const first = manifest();
  const second = {
    objects: [...first.objects].reverse().map(({ bytes, sha256, archivePath, key, bucket }) => ({
      bytes,
      sha256,
      archivePath,
      key,
      bucket,
    })),
    database: [...first.database].reverse(),
    supabaseCliVersion: first.supabaseCliVersion,
    postgresMajor: first.postgresMajor,
    platformBackupMode: first.platformBackupMode,
    sourceFingerprint: first.sourceFingerprint,
    sourceEnvironment: first.sourceEnvironment,
    createdAt: first.createdAt,
    backupId: first.backupId,
    schemaVersion: first.schemaVersion,
  };

  assert.equal(canonicalizeManifest(first), canonicalizeManifest(second));
  assert.equal(canonicalizeManifest(first).includes("\n"), false);
  assert.ok(canonicalizeManifest(first).indexOf("database/data.sql") < canonicalizeManifest(first).indexOf("database/schema.sql"));
  assert.ok(canonicalizeManifest(first).indexOf('"key":"alpha"') < canonicalizeManifest(first).indexOf('"key":"zeta"'));
});

test("SHA-256 produit le même digest pour des octets et un fichier lu en flux", async () => {
  const root = await mkdtemp(join(tmpdir(), "mbs-recovery-hash-"));
  const file = join(root, "payload.bin");
  await writeFile(file, Buffer.from("alpha"));
  assert.equal(await sha256File(file), HASH_A);
  assert.match(HASH_A, /^[a-f0-9]{64}$/);
});

test("la validation v1 refuse schéma, propriétés, dates, tailles et hashes invalides", () => {
  assert.throws(() => validateManifest(manifest({ schemaVersion: 2 })), expectCode("MANIFEST_SCHEMA_UNSUPPORTED"));
  assert.throws(() => validateManifest({ ...manifest(), secret: "non" }), expectCode("MANIFEST_UNKNOWN_FIELD"));
  assert.throws(() => validateManifest(manifest({ createdAt: "2026-08-06" })), expectCode("MANIFEST_INVALID_CREATED_AT"));
  assert.throws(() => validateManifest(manifest({ database: [{ path: "database/a.sql", sha256: "abc", bytes: 1 }] })), expectCode("MANIFEST_INVALID_SHA256"));
  assert.throws(() => validateManifest(manifest({ database: [{ path: "database/a.sql", sha256: HASH_A, bytes: -1 }] })), expectCode("MANIFEST_INVALID_BYTES"));
  assert.throws(() => validateManifest(manifest({ database: manifest().database.slice(1) })), expectCode("MANIFEST_DATABASE_EXPORTS_INCOMPLETE"));
});

test("les chemins absolus, traversées et séparateurs non POSIX sont refusés", () => {
  for (const path of ["../secret", "database/../secret", "/etc/passwd", "C:/secret", "database\\secret.sql"]) {
    assert.throws(
      () => validateManifest(manifest({ database: [{ path, sha256: HASH_A, bytes: 5 }] })),
      expectCode("MANIFEST_UNSAFE_PATH"),
      path,
    );
  }
});

test("les doublons de références et collisions de chemins sont refusés", () => {
  const object = manifest().objects[0];
  assert.throws(() => validateManifest(manifest({ objects: [object, { ...object, sha256: HASH_A }]})), expectCode("MANIFEST_DUPLICATE_OBJECT"));
  assert.throws(
    () => validateManifest(manifest({ objects: [object, { ...manifest().objects[1], archivePath: object.archivePath }] })),
    expectCode("MANIFEST_PATH_COLLISION"),
  );
  assert.throws(
    () => validateManifest(manifest({
      database: [
        ...manifest().database.slice(0, 3),
        { path: "database/roles.sql", sha256: HASH_A, bytes: 5 },
        { path: "database/schema.sql", sha256: HASH_A, bytes: 6 },
      ],
    })),
    expectCode("MANIFEST_HASH_COLLISION"),
  );
});

test("la vérification contrôle digest, fichiers, tailles, hashes et inventaire exact", async () => {
  const root = await mkdtemp(join(tmpdir(), "mbs-recovery-point-"));
  await mkdir(join(root, "database"));
  await mkdir(join(root, "objects"));
  await writeFile(join(root, "database", "data.sql"), "alpha");
  await writeFile(join(root, "database", "schema.sql"), "beta");
  for (const name of ["history-data.sql", "history-schema.sql", "roles.sql"]) await writeFile(join(root, "database", name), "");
  await writeFile(join(root, "objects", HASH_A), "alpha");
  await writeFile(join(root, "objects", HASH_B), "beta");
  const value = manifest();
  const digest = sha256Bytes(Buffer.from(canonicalizeManifest(value)));
  const inventory = value.objects.map(({ bucket, key }) => ({ bucket, key }));

  await verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: digest, inventory });
  await assert.rejects(
    verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: HASH_A, inventory }),
    expectCode("MANIFEST_DIGEST_MISMATCH"),
  );
  await writeFile(join(root, "database", "data.sql"), "altered");
  await assert.rejects(
    verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: digest, inventory }),
    (error) => ["MANIFEST_FILE_SIZE_MISMATCH", "MANIFEST_FILE_HASH_MISMATCH"].includes(error?.code),
  );
  await writeFile(join(root, "database", "data.sql"), "alpha");
  await assert.rejects(
    verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: digest, inventory: inventory.slice(1) }),
    expectCode("MANIFEST_INVENTORY_MISMATCH"),
  );
  await assert.rejects(
    verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: digest, inventory: [...inventory, { bucket: "private", key: "extra" }] }),
    expectCode("MANIFEST_INVENTORY_MISMATCH"),
  );
  await unlink(join(root, "objects", HASH_B));
  await assert.rejects(
    verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: digest, inventory }),
    expectCode("MANIFEST_FILE_MISSING"),
  );
  await writeFile(join(root, "objects", HASH_B), "beta");
  await writeFile(join(root, "objects", "extra"), "orphan");
  await assert.rejects(
    verifyBackupPoint({ rootDir: root, manifest: value, manifestSha256: digest, inventory }),
    expectCode("MANIFEST_UNDECLARED_FILE"),
  );
});

test("un lien symbolique et un point déjà existant sont refusés", async () => {
  const root = await mkdtemp(join(tmpdir(), "mbs-recovery-links-"));
  const outside = join(root, "outside");
  await writeFile(outside, "alpha");
  await mkdir(join(root, "database"));
  await mkdir(join(root, "objects"));
  await symlink(outside, join(root, "database", "data.sql"), "file");
  await writeFile(join(root, "database", "schema.sql"), "beta");
  for (const name of ["history-data.sql", "history-schema.sql", "roles.sql"]) await writeFile(join(root, "database", name), "");
  await writeFile(join(root, "objects", HASH_A), "alpha");
  await writeFile(join(root, "objects", HASH_B), "beta");
  const value = manifest();
  await assert.rejects(
    verifyBackupPoint({
      rootDir: root,
      manifest: value,
      manifestSha256: sha256Bytes(Buffer.from(canonicalizeManifest(value))),
      inventory: value.objects,
    }),
    expectCode("MANIFEST_SYMLINK_FORBIDDEN"),
  );
  assert.throws(() => assertBackupPointCanBeCreated(root), expectCode("BACKUP_POINT_ALREADY_EXISTS"));
  assert.doesNotThrow(() => assertBackupPointCanBeCreated(join(root, "new-point")));
});

test("la stratégie choisit PITR uniquement quand il est disponible", () => {
  assert.equal(selectPlatformBackupMode({ pitrAvailable: true }), "pitr");
  assert.equal(selectPlatformBackupMode({ pitrAvailable: false }), "daily");
  assert.throws(() => selectPlatformBackupMode({ pitrAvailable: "yes" }), expectCode("POLICY_INVALID_PITR_AVAILABILITY"));
});

const approvedPolicy = (overrides = {}) => ({
  rpoMinutes: 15,
  rtoMinutes: 240,
  retentionDays: 35,
  platformBackupMode: "pitr",
  approvedAt: "2026-07-01T00:00:00.000Z",
  approvedByRole: "operations-owner",
  ...overrides,
});

const proof = (overrides = {}) => ({
  schemaVersion: 1,
  drillId: "018f62a0-4d4f-7abc-8def-1234567890ac",
  backupId: BACKUP_ID,
  verdict: "passed",
  startedAt: "2026-08-05T11:58:00.000Z",
  completedAt: "2026-08-05T12:00:00.000Z",
  durationMs: 120_000,
  manifestSha256: HASH_A,
  sourceEnvironment: "production",
  sourceFingerprint: "prod-mbs-v1",
  targetFingerprint: "production-recovery-mbs-v1",
  toolVersions: { postgresMajor: 17, supabaseCliVersion: "2.101.0" },
  databaseChecks: { dataVerified: true, authVerified: true, rlsVerified: true, migrationsVerified: true },
  storageChecks: { objects: 2, hashesVerified: true, metadataVerified: true, referencesVerified: true },
  errorCodes: [],
  ...overrides,
});

test("la politique impose exactement ses six champs et des valeurs approuvées strictes", () => {
  assert.deepEqual(validateRecoveryPolicy(approvedPolicy()), approvedPolicy());
  assert.deepEqual(validateRecoveryPolicy(approvedPolicy({ rpoMinutes: null, rtoMinutes: null, retentionDays: null, platformBackupMode: null, approvedAt: null, approvedByRole: null })), approvedPolicy({ rpoMinutes: null, rtoMinutes: null, retentionDays: null, platformBackupMode: null, approvedAt: null, approvedByRole: null }));
  assert.throws(() => validateRecoveryPolicy({ ...approvedPolicy(), extra: true }), expectCode("POLICY_UNKNOWN_FIELD"));
  for (const value of [0, -1, 1.5, "15"]) {
    assert.throws(() => validateRecoveryPolicy(approvedPolicy({ rpoMinutes: value })), expectCode("POLICY_INVALID_RPO"));
  }
  assert.throws(() => validateRecoveryPolicy(approvedPolicy({ platformBackupMode: "weekly" })), expectCode("POLICY_INVALID_BACKUP_MODE"));
  assert.throws(() => validateRecoveryPolicy(approvedPolicy({ approvedAt: "yesterday" })), expectCode("POLICY_INVALID_APPROVAL_DATE"));
  assert.throws(() => validateRecoveryPolicy(approvedPolicy({ approvedByRole: "" })), expectCode("POLICY_INVALID_APPROVER_ROLE"));
});

test("une politique non approuvée ne bloque jamais local, preview ou staging", () => {
  const unapproved = approvedPolicy({ rpoMinutes: null, rtoMinutes: null, retentionDays: null, platformBackupMode: null, approvedAt: null, approvedByRole: null });
  for (const environment of ["local", "preview", "staging"]) {
    assert.deepEqual(evaluateProductionPromotion({ environment, policy: unapproved }), { allowed: true, codes: [] });
  }
});

test("la production échoue fermée avec des codes stables", () => {
  const base = {
    environment: "production",
    policy: approvedPolicy(),
    proof: proof(),
    expectedManifestSha256: HASH_A,
    expectedSourceFingerprint: "prod-mbs-v1",
    expectedTargetFingerprint: "production-recovery-mbs-v1",
    expectedApprovedByRole: "operations-owner",
    now: new Date("2026-08-06T12:00:00.000Z"),
  };
  assert.deepEqual(evaluateProductionPromotion(base), { allowed: true, codes: [] });
  assert.deepEqual(evaluateProductionPromotion({ ...base, policy: approvedPolicy({ rpoMinutes: null }) }).codes, ["POLICY_NOT_APPROVED"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: undefined }).codes, ["PROOF_MISSING"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ verdict: "failed", errorCodes: ["FAILED"] }) }).codes, ["PROOF_FAILED"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ startedAt: "2026-06-30T23:58:00.000Z", completedAt: "2026-06-30T23:59:59.999Z" }) }).codes, ["PROOF_OUTSIDE_CURRENT_QUARTER"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ manifestSha256: HASH_B }) }).codes, ["PROOF_MANIFEST_MISMATCH"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ sourceEnvironment: "staging" }) }).codes, ["PROOF_ENVIRONMENT_MISMATCH"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ sourceFingerprint: "other" }) }).codes, ["PROOF_ENVIRONMENT_MISMATCH"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ targetFingerprint: "other" }) }).codes, ["PROOF_TARGET_MISMATCH"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ databaseChecks: { dataVerified: true, authVerified: true, rlsVerified: false, migrationsVerified: true } }) }).codes, ["PROOF_INVALID"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ toolVersions: { postgresMajor: 16, supabaseCliVersion: "2.101.0" } }) }).codes, ["PROOF_INVALID"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ toolVersions: { postgresMajor: 17, supabaseCliVersion: "2.111.0" } }) }).codes, ["PROOF_INVALID"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, policy: approvedPolicy({ approvedAt: "2026-08-07T00:00:00.000Z" }) }).codes, ["POLICY_APPROVAL_IN_FUTURE"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, expectedApprovedByRole: "security-owner" }).codes, ["POLICY_APPROVER_MISMATCH"]);
  assert.deepEqual(evaluateProductionPromotion({ ...base, proof: proof({ durationMs: 240 * 60_000 + 1 }) }).codes, ["PROOF_RTO_EXCEEDED"]);
});
