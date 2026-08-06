import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { canonicalizeManifest, sha256Bytes } from "../../scripts/recovery/manifest.mjs";

const run = (env) => spawnSync(process.execPath, ["scripts/verify-recovery-readiness.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, ...env },
  encoding: "utf8",
});

test("la readiness ne bloque pas les environnements hors production", () => {
  const result = run({ APP_ENV: "local", RECOVERY_POLICY_PATH: "config/recovery-policy.json" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RECOVERY_READY/);
});

test("la readiness refuse un environnement implicite", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-recovery-readiness.mjs"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RECOVERY_ENVIRONMENT_MISSING/);
});

test("la production échoue fermée avec la politique non approuvée du dépôt", () => {
  const result = run({ APP_ENV: "production", RECOVERY_POLICY_PATH: "config/recovery-policy.json" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /POLICY_NOT_APPROVED/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /postgresql:|service.role|private-media/i);
});

test("la production accepte une politique et une preuve cohérentes", async () => {
  const root = await mkdtemp(join(tmpdir(), "mbs-readiness-"));
  try {
    const now = new Date();
    const policyPath = join(root, "policy.json");
    const proofPath = join(root, "proof.json");
    const pointPath = join(root, "point");
    await mkdir(join(pointPath, "database"), { recursive: true });
    await mkdir(join(pointPath, "objects"));
    const database = [];
    for (const name of ["roles.sql", "schema.sql", "data.sql", "history-schema.sql", "history-data.sql"]) {
      const content = Buffer.from(`-- ${name}\n`);
      await writeFile(join(pointPath, "database", name), content);
      database.push({ path: `database/${name}`, sha256: sha256Bytes(content), bytes: content.byteLength });
    }
    const manifest = {
      schemaVersion: 1,
      backupId: "018f62a0-4d4f-7abc-8def-1234567890ab",
      createdAt: now.toISOString(),
      sourceEnvironment: "production",
      sourceFingerprint: "production-mbs-v1",
      platformBackupMode: "pitr",
      postgresMajor: 17,
      supabaseCliVersion: "2.101.0",
      database,
      objects: [],
    };
    const manifestText = canonicalizeManifest(manifest);
    const manifestSha256 = sha256Bytes(Buffer.from(manifestText));
    await writeFile(join(pointPath, "manifest.json"), manifestText);
    await writeFile(join(pointPath, "manifest.sha256"), `${manifestSha256}\n`);
    await writeFile(join(pointPath, "FINALIZED"), `${manifestSha256}\n`);
    await writeFile(policyPath, JSON.stringify({
      rpoMinutes: 15,
      rtoMinutes: 240,
      retentionDays: 35,
      platformBackupMode: "pitr",
      approvedAt: now.toISOString(),
      approvedByRole: "operations-owner",
    }));
    await writeFile(proofPath, JSON.stringify({
      schemaVersion: 1,
      drillId: "018f62a0-4d4f-7abc-8def-1234567890ac",
      backupId: manifest.backupId,
      verdict: "passed",
      startedAt: new Date(now.getTime() - 1_000).toISOString(),
      completedAt: now.toISOString(),
      durationMs: 1_000,
      manifestSha256,
      sourceEnvironment: "production",
      sourceFingerprint: "production-mbs-v1",
      targetFingerprint: "production-recovery-mbs-v1",
      toolVersions: { postgresMajor: 17, supabaseCliVersion: "2.101.0" },
      databaseChecks: { dataVerified: true, authVerified: true, rlsVerified: true, migrationsVerified: true },
      storageChecks: { objects: 0, hashesVerified: true, metadataVerified: true, referencesVerified: true },
      errorCodes: [],
    }));
    const result = run({
      APP_ENV: "production",
      RECOVERY_POLICY_PATH: policyPath,
      RECOVERY_PROOF_PATH: proofPath,
      RECOVERY_BACKUP_POINT_PATH: pointPath,
      RECOVERY_EXPECTED_MANIFEST_SHA256: manifestSha256,
      RECOVERY_EXPECTED_SOURCE_FINGERPRINT: "production-mbs-v1",
      RECOVERY_EXPECTED_TARGET_FINGERPRINT: "production-recovery-mbs-v1",
      RECOVERY_EXPECTED_APPROVER_ROLE: "operations-owner",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /RECOVERY_READY/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
