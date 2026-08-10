export const PENDING_INTENT_SCHEMA_VERSION = 1 as const;
export const MAX_PENDING_INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CommandEnvelope<TType extends string = string, TPayload = unknown> = Readonly<{
  commandId: string;
  commandType: TType;
  actorId: string;
  aggregateIds: readonly string[];
  expectedVersions: Readonly<Record<string, number>>;
  payload: TPayload;
  occurredAt: string;
}>;

export type MutationReceipt = Readonly<{
  commandId: string;
  commandType: string;
  status: "confirmed" | "replayed";
  resultVersions: Readonly<Record<string, number>>;
  confirmedAt: string;
}>;

export type VersionedSnapshot<T> = Readonly<{
  value: T;
  versions: Readonly<Record<string, number>>;
  confirmedAt: string;
}>;

export type PersistedIntent<TIntent = unknown, TConfirmed = unknown> = Readonly<{
  schemaVersion: typeof PENDING_INTENT_SCHEMA_VERSION;
  aggregateKey: string;
  envelope: CommandEnvelope<string, TIntent>;
  confirmed: VersionedSnapshot<TConfirmed>;
  optimistic: TConfirmed;
  storedAt: string;
  expiresAt: string;
}>;

export type MutationFailureCode =
  | "SAVE_UNAVAILABLE"
  | "SAVE_REJECTED"
  | "SAVE_COMMAND_REUSED"
  | "SAVE_SESSION_EXPIRED";

export type MutationFailure = Readonly<{
  code: MutationFailureCode;
  retryable: boolean;
}>;

export type MutationTransportResult =
  | Readonly<{ kind: "receipt"; receipt: MutationReceipt }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "failure"; error: MutationFailure }>;

export interface MutationTransport<TConfirmed> {
  send(command: CommandEnvelope): Promise<MutationTransportResult>;
  loadConfirmed(aggregateKey: string): Promise<VersionedSnapshot<TConfirmed>>;
}

export interface PendingIntentStore {
  put(intent: PersistedIntent): Promise<void>;
  get(actorId: string, commandId: string): Promise<PersistedIntent | null>;
  list(actorId: string): Promise<readonly PersistedIntent[]>;
  delete(actorId: string, commandId: string): Promise<void>;
  replace(actorId: string, commandId: string, intent: PersistedIntent): Promise<void>;
  purgeActor(actorId: string): Promise<void>;
}

export interface MutationClock {
  now(): Date;
}

export type ConflictCommandFactory<TIntent, TConfirmed> = (
  previous: CommandEnvelope<string, TIntent>,
  remote: VersionedSnapshot<TConfirmed>,
) => CommandEnvelope<string, TIntent>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");

const isIsoDate = (value: unknown) => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};

const hasSafeVersions = (value: unknown): value is Readonly<Record<string, number>> =>
  isRecord(value) && Object.keys(value).length > 0 && Object.entries(value).every(
    ([key, revision]) => key.length > 0 && Number.isSafeInteger(revision) && Number(revision) >= 0,
  );

const isJsonValue = (value: unknown, seen = new Set<object>()): boolean => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.entries(value).every(([key, item]) => key.length > 0 && isJsonValue(item, seen));
  seen.delete(value);
  return valid;
};

const SENSITIVE_KEY = /^(authorization|cookie|password|providerMessage|secret|token)$/i;
const hasSensitiveKey = (value: unknown, seen = new Set<object>()): boolean => {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const entries = Array.isArray(value) ? value.map((item) => ["", item] as const) : Object.entries(value);
  const sensitive = entries.some(([key, item]) => SENSITIVE_KEY.test(key) || hasSensitiveKey(item, seen));
  seen.delete(value);
  return sensitive;
};

export function canPersistOffline(commandType: string): boolean {
  return !/(purchase|credit|reward)/i.test(commandType);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isUuidV7(value: unknown): value is string {
  return typeof value === "string" && UUID_V7.test(value);
}

export function isCommandEnvelope(value: unknown): value is CommandEnvelope {
  if (!isRecord(value)) return false;
  return hasExactKeys(value, ["commandId", "commandType", "actorId", "aggregateIds", "expectedVersions", "payload", "occurredAt"]) &&
    isUuidV7(value.commandId) && typeof value.commandType === "string" && value.commandType.length > 0 &&
    isUuid(value.actorId) && Array.isArray(value.aggregateIds) && value.aggregateIds.length > 0 &&
    value.aggregateIds.every(isUuid) && hasSafeVersions(value.expectedVersions) &&
    isJsonValue(value.payload) && !hasSensitiveKey(value.payload) && isIsoDate(value.occurredAt);
}

export function isMutationReceipt(value: unknown): value is MutationReceipt {
  if (!isRecord(value)) return false;
  return hasExactKeys(value, ["commandId", "commandType", "status", "resultVersions", "confirmedAt"]) &&
    isUuidV7(value.commandId) && typeof value.commandType === "string" && value.commandType.length > 0 &&
    (value.status === "confirmed" || value.status === "replayed") &&
    hasSafeVersions(value.resultVersions) && isIsoDate(value.confirmedAt);
}

export function isVersionedSnapshot(value: unknown): value is VersionedSnapshot<unknown> {
  return isRecord(value) && hasExactKeys(value, ["value", "versions", "confirmedAt"]) &&
    isJsonValue(value.value) && !hasSensitiveKey(value.value) && hasSafeVersions(value.versions) && isIsoDate(value.confirmedAt);
}

export function isPersistedIntent(value: unknown, actorId?: string, now = new Date()): value is PersistedIntent {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schemaVersion", "aggregateKey", "envelope", "confirmed", "optimistic", "storedAt", "expiresAt",
  ]) || value.schemaVersion !== PENDING_INTENT_SCHEMA_VERSION ||
    typeof value.aggregateKey !== "string" || value.aggregateKey.length === 0 ||
    !isCommandEnvelope(value.envelope) || !isVersionedSnapshot(value.confirmed) || !isJsonValue(value.optimistic) ||
    !isIsoDate(value.storedAt) || !isIsoDate(value.expiresAt)) return false;
  if (actorId !== undefined && value.envelope.actorId !== actorId) return false;
  const storedAt = value.storedAt as string;
  const expiresAt = value.expiresAt as string;
  const storedAtMs = new Date(storedAt).getTime();
  const expiresAtMs = new Date(expiresAt).getTime();
  return storedAtMs <= now.getTime() && expiresAtMs > now.getTime() &&
    expiresAtMs > storedAtMs && expiresAtMs - storedAtMs <= MAX_PENDING_INTENT_TTL_MS &&
    canPersistOffline(value.envelope.commandType) && !hasSensitiveKey(value.optimistic);
}

export function receiptMatches(command: CommandEnvelope, receipt: MutationReceipt): boolean {
  return receipt.commandId === command.commandId && receipt.commandType === command.commandType;
}
