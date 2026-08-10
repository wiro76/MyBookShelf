import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { evaluateProductionPromotion } from "./recovery/policy.mjs";
import { validateManifest, verifyBackupPoint } from "./recovery/manifest.mjs";

const readJson = async (path, errorCode) => {
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch {
    throw new Error(errorCode);
  }
};

const main = async () => {
  const environment = process.env.APP_ENV;
  if (!environment) throw new Error("RECOVERY_ENVIRONMENT_MISSING");
  const policy = await readJson(
    process.env.RECOVERY_POLICY_PATH ?? "config/recovery-policy.json",
    "RECOVERY_POLICY_UNREADABLE",
  );
  const baseInput = {
    environment,
    policy,
    expectedSourceFingerprint: process.env.RECOVERY_EXPECTED_SOURCE_FINGERPRINT,
    expectedTargetFingerprint: process.env.RECOVERY_EXPECTED_TARGET_FINGERPRINT,
    expectedApprovedByRole: process.env.RECOVERY_EXPECTED_APPROVER_ROLE,
  };
  const policyDecision = evaluateProductionPromotion(baseInput);
  if (!policyDecision.allowed && !policyDecision.codes.includes("PROOF_MISSING")) {
    throw new Error(policyDecision.codes.join(","));
  }

  let proof;
  let expectedManifestSha256;
  if (environment === "production") {
    proof = await readJson(process.env.RECOVERY_PROOF_PATH ?? "", "RECOVERY_PROOF_UNREADABLE");
    const pointDirectory = resolve(process.env.RECOVERY_BACKUP_POINT_PATH ?? "");
    try {
      const manifest = validateManifest(JSON.parse(await readFile(join(pointDirectory, "manifest.json"), "utf8")));
      expectedManifestSha256 = (await readFile(join(pointDirectory, "manifest.sha256"), "utf8")).trim();
      const finalized = (await readFile(join(pointDirectory, "FINALIZED"), "utf8")).trim();
      if (finalized !== expectedManifestSha256) throw new Error("RECOVERY_POINT_NOT_FINALIZED");
      await verifyBackupPoint({
        rootDir: pointDirectory,
        manifest,
        manifestSha256: expectedManifestSha256,
        inventory: manifest.objects.map(({ bucket, key }) => ({ bucket, key })),
      });
    } catch (error) {
      if (error?.message === "RECOVERY_POINT_NOT_FINALIZED") throw error;
      throw new Error("RECOVERY_BACKUP_POINT_INVALID");
    }
    if (process.env.RECOVERY_EXPECTED_MANIFEST_SHA256 !== expectedManifestSha256) {
      throw new Error("RECOVERY_EXPECTED_MANIFEST_MISMATCH");
    }
  }
  const decision = evaluateProductionPromotion({ ...baseInput, proof, expectedManifestSha256 });

  if (!decision.allowed) {
    throw new Error(decision.codes.join(","));
  }
  process.stdout.write("RECOVERY_READY\n");
};

main().catch((error) => {
  process.stderr.write(`${typeof error?.code === "string" ? error.code : error instanceof Error ? error.message : "RECOVERY_READINESS_FAILED"}\n`);
  process.exitCode = 1;
});
