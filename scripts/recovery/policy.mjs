const POLICY_FIELDS = [
  "rpoMinutes",
  "rtoMinutes",
  "retentionDays",
  "platformBackupMode",
  "approvedAt",
  "approvedByRole",
];
const ENVIRONMENTS = new Set(["local", "preview", "staging", "production"]);
const MODES = new Set(["pitr", "daily"]);
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DATABASE_CHECK_FIELDS = ["dataVerified", "authVerified", "rlsVerified", "migrationsVerified"];
const STORAGE_CHECK_FIELDS = ["objects", "hashesVerified", "metadataVerified", "referencesVerified"];

export class RecoveryPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RecoveryPolicyError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new RecoveryPolicyError(code, message);
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const isCanonicalUtcInstant = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};

export const selectPlatformBackupMode = ({ pitrAvailable } = {}) => {
  if (typeof pitrAvailable !== "boolean") fail("POLICY_INVALID_PITR_AVAILABILITY", "La disponibilité PITR doit être booléenne");
  return pitrAvailable ? "pitr" : "daily";
};

export const validateRecoveryPolicy = (value) => {
  if (!isPlainObject(value)) fail("POLICY_INVALID_TYPE", "La politique doit être un objet JSON");
  const expected = new Set(POLICY_FIELDS);
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) fail("POLICY_UNKNOWN_FIELD", `Champ inconnu: ${field}`);
  }
  for (const field of POLICY_FIELDS) {
    if (!Object.hasOwn(value, field)) fail("POLICY_MISSING_FIELD", `Champ requis: ${field}`);
  }

  const positiveInteger = (field, code) => {
    const fieldValue = value[field];
    if (fieldValue !== null && (!Number.isSafeInteger(fieldValue) || fieldValue <= 0)) fail(code, `${field} doit être un entier positif ou null`);
  };
  positiveInteger("rpoMinutes", "POLICY_INVALID_RPO");
  positiveInteger("rtoMinutes", "POLICY_INVALID_RTO");
  positiveInteger("retentionDays", "POLICY_INVALID_RETENTION");
  if (value.platformBackupMode !== null && !MODES.has(value.platformBackupMode)) fail("POLICY_INVALID_BACKUP_MODE", "Mode plateforme invalide");
  if (value.approvedAt !== null && !isCanonicalUtcInstant(value.approvedAt)) fail("POLICY_INVALID_APPROVAL_DATE", "Date d'approbation UTC invalide");
  if (
    value.approvedByRole !== null &&
    (typeof value.approvedByRole !== "string" || value.approvedByRole.length === 0 || value.approvedByRole.length > 128 || !/^[a-z][a-z0-9-]*$/.test(value.approvedByRole))
  ) {
    fail("POLICY_INVALID_APPROVER_ROLE", "Rôle approbateur invalide");
  }
  return Object.fromEntries(POLICY_FIELDS.map((field) => [field, value[field]]));
};

const isApproved = (policy) =>
  Number.isSafeInteger(policy.rpoMinutes) && policy.rpoMinutes > 0 &&
  Number.isSafeInteger(policy.rtoMinutes) && policy.rtoMinutes > 0 &&
  Number.isSafeInteger(policy.retentionDays) && policy.retentionDays > 0 &&
  MODES.has(policy.platformBackupMode) &&
  isCanonicalUtcInstant(policy.approvedAt) &&
  typeof policy.approvedByRole === "string" && policy.approvedByRole.length > 0;

const currentUtcQuarterStart = (now) =>
  Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1, 0, 0, 0, 0);

const hasExactFields = (value, fields) =>
  isPlainObject(value) && Object.keys(value).sort().join("\0") === [...fields].sort().join("\0");

const validProofShape = (proof) => {
  if (!isPlainObject(proof) || proof.schemaVersion !== 1 || !UUID.test(proof.drillId ?? "") || !UUID.test(proof.backupId ?? "")) return false;
  if (!isCanonicalUtcInstant(proof.startedAt) || !isCanonicalUtcInstant(proof.completedAt)) return false;
  if (new Date(proof.startedAt).getTime() > new Date(proof.completedAt).getTime()) return false;
  if ((proof.verdict !== "passed" && proof.verdict !== "failed") || !Array.isArray(proof.errorCodes)) return false;
  if (!Number.isSafeInteger(proof.durationMs) || proof.durationMs < 0 || !SHA256.test(proof.manifestSha256 ?? "")) return false;
  if (!ENVIRONMENTS.has(proof.sourceEnvironment) || typeof proof.sourceFingerprint !== "string" || proof.sourceFingerprint.length === 0) return false;
  if (typeof proof.targetFingerprint !== "string" || proof.targetFingerprint.length === 0) return false;
  if (!hasExactFields(proof.toolVersions, ["postgresMajor", "supabaseCliVersion"])) return false;
  if (proof.toolVersions.postgresMajor !== 17 || proof.toolVersions.supabaseCliVersion !== "2.101.0") return false;
  if (!hasExactFields(proof.databaseChecks, DATABASE_CHECK_FIELDS) || DATABASE_CHECK_FIELDS.some((field) => proof.databaseChecks[field] !== true)) return false;
  if (!hasExactFields(proof.storageChecks, STORAGE_CHECK_FIELDS)) return false;
  if (!Number.isSafeInteger(proof.storageChecks.objects) || proof.storageChecks.objects < 0) return false;
  if (["hashesVerified", "metadataVerified", "referencesVerified"].some((field) => proof.storageChecks[field] !== true)) return false;
  return proof.verdict === "passed" ? proof.errorCodes.length === 0 : proof.errorCodes.length > 0;
};

export const evaluateProductionPromotion = ({
  environment,
  policy,
  proof,
  expectedManifestSha256,
  expectedSourceFingerprint,
  expectedTargetFingerprint,
  expectedApprovedByRole,
  now = new Date(),
} = {}) => {
  if (!ENVIRONMENTS.has(environment)) fail("POLICY_INVALID_ENVIRONMENT", "Environnement de promotion invalide");
  if (environment !== "production") return { allowed: true, codes: [] };

  let normalizedPolicy;
  try {
    normalizedPolicy = validateRecoveryPolicy(policy);
  } catch {
    return { allowed: false, codes: ["POLICY_INVALID"] };
  }
  if (!isApproved(normalizedPolicy)) return { allowed: false, codes: ["POLICY_NOT_APPROVED"] };
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) fail("POLICY_INVALID_NOW", "Horodatage de décision invalide");
  if (new Date(normalizedPolicy.approvedAt).getTime() > instant.getTime()) return { allowed: false, codes: ["POLICY_APPROVAL_IN_FUTURE"] };
  if (typeof expectedApprovedByRole !== "string" || normalizedPolicy.approvedByRole !== expectedApprovedByRole) {
    return { allowed: false, codes: ["POLICY_APPROVER_MISMATCH"] };
  }
  if (proof === undefined || proof === null) return { allowed: false, codes: ["PROOF_MISSING"] };
  if (!validProofShape(proof)) return { allowed: false, codes: ["PROOF_INVALID"] };
  if (proof.verdict !== "passed") return { allowed: false, codes: ["PROOF_FAILED"] };

  const completedAt = new Date(proof.completedAt).getTime();
  if (completedAt < currentUtcQuarterStart(instant) || completedAt > instant.getTime()) {
    return { allowed: false, codes: ["PROOF_OUTSIDE_CURRENT_QUARTER"] };
  }
  if (!SHA256.test(expectedManifestSha256 ?? "") || proof.manifestSha256 !== expectedManifestSha256) {
    return { allowed: false, codes: ["PROOF_MANIFEST_MISMATCH"] };
  }
  if (
    proof.sourceEnvironment !== "production" ||
    typeof expectedSourceFingerprint !== "string" ||
    expectedSourceFingerprint.length === 0 ||
    proof.sourceFingerprint !== expectedSourceFingerprint
  ) {
    return { allowed: false, codes: ["PROOF_ENVIRONMENT_MISMATCH"] };
  }
  if (typeof expectedTargetFingerprint !== "string" || proof.targetFingerprint !== expectedTargetFingerprint) {
    return { allowed: false, codes: ["PROOF_TARGET_MISMATCH"] };
  }
  if (proof.durationMs > normalizedPolicy.rtoMinutes * 60_000) {
    return { allowed: false, codes: ["PROOF_RTO_EXCEEDED"] };
  }
  return { allowed: true, codes: [] };
};
