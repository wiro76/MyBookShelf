import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MANIFEST_FIELDS = [
  "schemaVersion",
  "backupId",
  "createdAt",
  "sourceEnvironment",
  "sourceFingerprint",
  "platformBackupMode",
  "postgresMajor",
  "supabaseCliVersion",
  "database",
  "objects",
];
const DATABASE_FIELDS = ["path", "sha256", "bytes"];
const OBJECT_FIELDS = ["bucket", "key", "archivePath", "sha256", "bytes"];
const REQUIRED_DATABASE_PATHS = [
  "database/data.sql",
  "database/history-data.sql",
  "database/history-schema.sql",
  "database/roles.sql",
  "database/schema.sql",
];
const ENVIRONMENTS = new Set(["local", "preview", "staging", "production"]);
const BACKUP_MODES = new Set(["pitr", "daily"]);
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export class RecoveryManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RecoveryManifestError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new RecoveryManifestError(code, message);
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const assertExactFields = (value, fields, context) => {
  if (!isPlainObject(value)) fail("MANIFEST_INVALID_TYPE", `${context} doit être un objet JSON`);
  const expected = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!expected.has(field)) fail("MANIFEST_UNKNOWN_FIELD", `${context}.${field} est inconnu`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail("MANIFEST_MISSING_FIELD", `${context}.${field} est requis`);
  }
};

const assertSafeText = (value, code, label) => {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(code, `${label} est invalide`);
  }
};

const assertSha256 = (value) => {
  if (typeof value !== "string" || !SHA256.test(value)) fail("MANIFEST_INVALID_SHA256", "SHA-256 invalide");
};

const assertBytes = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail("MANIFEST_INVALID_BYTES", "Taille invalide");
};

const assertUtcInstant = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    fail("MANIFEST_INVALID_CREATED_AT", "Date UTC invalide");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail("MANIFEST_INVALID_CREATED_AT", "Date UTC invalide");
  }
};

export const assertSafeRelativePath = (value) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 1024 ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[a-zA-Z]:/.test(value) ||
    isAbsolute(value)
  ) {
    fail("MANIFEST_UNSAFE_PATH", "Chemin non relatif ou non POSIX");
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    fail("MANIFEST_UNSAFE_PATH", "Chemin non normalisé ou traversant");
  }
  return value;
};

const sameRecord = (left, right, fields) => fields.every((field) => left[field] === right[field]);

const normalizeDatabase = (entries) => {
  if (!Array.isArray(entries)) fail("MANIFEST_INVALID_TYPE", "database doit être un tableau");
  const byPath = new Map();
  for (const entry of entries) {
    assertExactFields(entry, DATABASE_FIELDS, "database[]");
    assertSafeRelativePath(entry.path);
    if (!entry.path.startsWith("database/")) fail("MANIFEST_UNSAFE_PATH", "Un export doit rester sous database/");
    assertSha256(entry.sha256);
    assertBytes(entry.bytes);
    const previous = byPath.get(entry.path);
    if (previous && !sameRecord(previous, entry, DATABASE_FIELDS)) {
      fail("MANIFEST_PATH_COLLISION", `Collision sur ${entry.path}`);
    }
    byPath.set(entry.path, previous ?? { ...entry });
  }
  const normalized = [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(normalized.map(({ path }) => path)) !== JSON.stringify(REQUIRED_DATABASE_PATHS)) {
    fail("MANIFEST_DATABASE_EXPORTS_INCOMPLETE", "Les cinq exports SQL canoniques sont obligatoires");
  }
  return normalized;
};

const normalizeObjects = (entries, occupiedPaths) => {
  if (!Array.isArray(entries)) fail("MANIFEST_INVALID_TYPE", "objects doit être un tableau");
  const byReference = new Map();
  const byArchivePath = new Map();
  const normalized = [];
  for (const entry of entries) {
    assertExactFields(entry, OBJECT_FIELDS, "objects[]");
    assertSafeText(entry.bucket, "MANIFEST_INVALID_BUCKET", "Bucket");
    assertSafeText(entry.key, "MANIFEST_INVALID_KEY", "Clé objet");
    assertSafeRelativePath(entry.archivePath);
    if (!entry.archivePath.startsWith("objects/")) fail("MANIFEST_UNSAFE_PATH", "Une archive doit rester sous objects/");
    assertSha256(entry.sha256);
    assertBytes(entry.bytes);
    if (occupiedPaths.has(entry.archivePath)) fail("MANIFEST_PATH_COLLISION", `Collision sur ${entry.archivePath}`);

    const reference = `${entry.bucket}\0${entry.key}`;
    const previousReference = byReference.get(reference);
    if (previousReference) {
      if (!sameRecord(previousReference, entry, OBJECT_FIELDS)) {
        fail("MANIFEST_DUPLICATE_OBJECT", `Référence objet dupliquée: ${entry.bucket}/${entry.key}`);
      }
      continue;
    }

    const previousArchive = byArchivePath.get(entry.archivePath);
    if (previousArchive && (previousArchive.sha256 !== entry.sha256 || previousArchive.bytes !== entry.bytes)) {
      fail("MANIFEST_PATH_COLLISION", `Collision sur ${entry.archivePath}`);
    }
    if (entry.archivePath !== `objects/${entry.sha256}`) {
      fail("MANIFEST_ARCHIVE_PATH_MISMATCH", "Le chemin d'archive doit être adressé par SHA-256");
    }
    byReference.set(reference, entry);
    byArchivePath.set(entry.archivePath, entry);
    normalized.push({ ...entry });
  }
  return normalized.sort((left, right) => left.bucket.localeCompare(right.bucket) || left.key.localeCompare(right.key));
};

export const validateManifest = (value) => {
  assertExactFields(value, MANIFEST_FIELDS, "manifest");
  if (value.schemaVersion !== 1) fail("MANIFEST_SCHEMA_UNSUPPORTED", "Seul le manifeste v1 est accepté");
  if (typeof value.backupId !== "string" || !UUID.test(value.backupId)) fail("MANIFEST_INVALID_BACKUP_ID", "backupId invalide");
  assertUtcInstant(value.createdAt);
  if (!ENVIRONMENTS.has(value.sourceEnvironment)) fail("MANIFEST_INVALID_ENVIRONMENT", "Environnement source invalide");
  assertSafeText(value.sourceFingerprint, "MANIFEST_INVALID_FINGERPRINT", "Fingerprint source");
  if (!BACKUP_MODES.has(value.platformBackupMode)) fail("MANIFEST_INVALID_BACKUP_MODE", "Mode de sauvegarde invalide");
  if (!Number.isSafeInteger(value.postgresMajor) || value.postgresMajor <= 0) fail("MANIFEST_INVALID_POSTGRES_MAJOR", "Version PostgreSQL invalide");
  assertSafeText(value.supabaseCliVersion, "MANIFEST_INVALID_CLI_VERSION", "Version CLI Supabase");

  const database = normalizeDatabase(value.database);
  const objects = normalizeObjects(value.objects, new Set(database.map((entry) => entry.path)));
  const bytesByHash = new Map();
  for (const entry of [...database, ...objects]) {
    const previousBytes = bytesByHash.get(entry.sha256);
    if (previousBytes !== undefined && previousBytes !== entry.bytes) {
      fail("MANIFEST_HASH_COLLISION", "Un même SHA-256 déclare plusieurs tailles");
    }
    bytesByHash.set(entry.sha256, entry.bytes);
  }
  return {
    schemaVersion: value.schemaVersion,
    backupId: value.backupId,
    createdAt: value.createdAt,
    sourceEnvironment: value.sourceEnvironment,
    sourceFingerprint: value.sourceFingerprint,
    platformBackupMode: value.platformBackupMode,
    postgresMajor: value.postgresMajor,
    supabaseCliVersion: value.supabaseCliVersion,
    database,
    objects,
  };
};

const sortJson = (value) => {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
};

export const canonicalizeManifest = (value) => JSON.stringify(sortJson(validateManifest(value)));

export const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const sha256File = async (filePath) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
};

const resolveInside = (rootDir, manifestPath) => {
  assertSafeRelativePath(manifestPath);
  const root = resolve(rootDir);
  const target = resolve(root, ...manifestPath.split("/"));
  const relation = relative(root, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    fail("MANIFEST_UNSAFE_PATH", "Le chemin sort du point de sauvegarde");
  }
  return target;
};

const listFilesWithoutLinks = async (directory, relativeBase) => {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return found;
    throw error;
  }
  for (const entry of entries) {
    const path = joinPath(directory, entry.name);
    const relativePath = `${relativeBase}/${entry.name}`;
    if (entry.isSymbolicLink()) fail("MANIFEST_SYMLINK_FORBIDDEN", `Lien symbolique interdit: ${relativePath}`);
    if (entry.isDirectory()) found.push(...(await listFilesWithoutLinks(path, relativePath)));
    else if (entry.isFile()) found.push(relativePath);
    else fail("MANIFEST_UNSUPPORTED_FILE_TYPE", `Type de fichier interdit: ${relativePath}`);
  }
  return found;
};

const joinPath = (...parts) => parts.join(sep);

const assertRegularFile = async (filePath) => {
  let metadata;
  try {
    metadata = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") fail("MANIFEST_FILE_MISSING", "Fichier déclaré absent");
    throw error;
  }
  if (metadata.isSymbolicLink()) fail("MANIFEST_SYMLINK_FORBIDDEN", "Lien symbolique interdit");
  if (!metadata.isFile()) fail("MANIFEST_UNSUPPORTED_FILE_TYPE", "L'entrée déclarée n'est pas un fichier");
  return metadata;
};

const normalizeInventory = (inventory) => {
  if (!Array.isArray(inventory)) fail("MANIFEST_INVENTORY_MISMATCH", "Inventaire absent");
  const keys = inventory.map((entry) => {
    if (!isPlainObject(entry) || typeof entry.bucket !== "string" || typeof entry.key !== "string") {
      fail("MANIFEST_INVENTORY_MISMATCH", "Entrée d'inventaire invalide");
    }
    return `${entry.bucket}\0${entry.key}`;
  });
  return keys.sort();
};

export const verifyBackupPoint = async ({ rootDir, manifest, manifestSha256, inventory }) => {
  const normalized = validateManifest(manifest);
  assertSha256(manifestSha256);
  const actualManifestDigest = sha256Bytes(Buffer.from(canonicalizeManifest(normalized), "utf8"));
  if (actualManifestDigest !== manifestSha256) fail("MANIFEST_DIGEST_MISMATCH", "Le digest du manifeste ne correspond pas");

  const expectedInventory = normalized.objects.map(({ bucket, key }) => ({ bucket, key }));
  if (JSON.stringify(normalizeInventory(inventory)) !== JSON.stringify(normalizeInventory(expectedInventory))) {
    fail("MANIFEST_INVENTORY_MISMATCH", "L'inventaire Storage diffère du manifeste");
  }

  const fileEntries = [...normalized.database, ...normalized.objects];
  for (const entry of fileEntries) {
    const manifestPath = entry.path ?? entry.archivePath;
    const filePath = resolveInside(rootDir, manifestPath);
    const metadata = await assertRegularFile(filePath);
    if (metadata.size !== entry.bytes) fail("MANIFEST_FILE_SIZE_MISMATCH", `Taille incorrecte: ${manifestPath}`);
    if ((await sha256File(filePath)) !== entry.sha256) fail("MANIFEST_FILE_HASH_MISMATCH", `Hash incorrect: ${manifestPath}`);
  }

  const expectedPaths = new Set(fileEntries.map((entry) => entry.path ?? entry.archivePath));
  const actualPaths = [
    ...(await listFilesWithoutLinks(resolve(rootDir, "database"), "database")),
    ...(await listFilesWithoutLinks(resolve(rootDir, "objects"), "objects")),
  ];
  for (const actualPath of actualPaths) {
    if (!expectedPaths.has(actualPath)) fail("MANIFEST_UNDECLARED_FILE", `Fichier non déclaré: ${actualPath}`);
  }
  return normalized;
};

export const assertBackupPointCanBeCreated = (pointDir) => {
  if (existsSync(pointDir)) {
    const metadata = lstatSync(pointDir);
    if (metadata.isSymbolicLink()) fail("MANIFEST_SYMLINK_FORBIDDEN", "La cible est un lien symbolique");
    fail("BACKUP_POINT_ALREADY_EXISTS", "Le point existe déjà et ne sera pas écrasé");
  }
};
