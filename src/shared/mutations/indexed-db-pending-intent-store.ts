import {
  isPersistedIntent,
  type MutationClock,
  type PendingIntentStore,
  type PersistedIntent,
} from "./contracts";

const STORE_NAME = "pending-intents";
const ACTOR_INDEX = "actor-id";
const systemClock: MutationClock = { now: () => new Date() };

type StoredRecord = PersistedIntent & { actorId: string; commandId: string; storageKey: string };
const storageKey = (actorId: string, commandId: string) => `${actorId}:${commandId}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const hasExactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
const STORED_RECORD_KEYS = [
  "schemaVersion", "aggregateKey", "envelope", "confirmed", "optimistic", "storedAt", "expiresAt",
  "actorId", "commandId", "storageKey",
] as const;

const toIntent = (record: Record<string, unknown>): PersistedIntent => ({
  schemaVersion: record.schemaVersion as PersistedIntent["schemaVersion"],
  aggregateKey: record.aggregateKey as string,
  envelope: record.envelope as PersistedIntent["envelope"],
  confirmed: record.confirmed as PersistedIntent["confirmed"],
  optimistic: record.optimistic,
  storedAt: record.storedAt as string,
  expiresAt: record.expiresAt as string,
});

const toStoredRecord = (intent: PersistedIntent): StoredRecord => ({
  schemaVersion: intent.schemaVersion,
  aggregateKey: intent.aggregateKey,
  envelope: structuredClone(intent.envelope),
  confirmed: structuredClone(intent.confirmed),
  optimistic: structuredClone(intent.optimistic),
  storedAt: intent.storedAt,
  expiresAt: intent.expiresAt,
  actorId: intent.envelope.actorId,
  commandId: intent.envelope.commandId,
  storageKey: storageKey(intent.envelope.actorId, intent.envelope.commandId),
});

const validStoredIntent = (value: unknown, actorId: string, key: string, now: Date): PersistedIntent | null => {
  if (!isRecord(value) || !hasExactKeys(value, STORED_RECORD_KEYS) ||
    value.actorId !== actorId || typeof value.commandId !== "string" || value.storageKey !== key) return null;
  const intent = toIntent(value);
  return value.commandId === intent.envelope?.commandId && key === storageKey(actorId, value.commandId) &&
    isPersistedIntent(intent, actorId, now) ? intent : null;
};

export interface IndexedDbPendingIntentStoreOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
  clock?: MutationClock;
}

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.addEventListener("success", () => resolve(request.result), { once: true });
  request.addEventListener("error", () => reject(request.error ?? new Error("INDEXED_DB_REQUEST_FAILED")), { once: true });
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.addEventListener("complete", () => resolve(), { once: true });
  transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_ABORTED")), { once: true });
  transaction.addEventListener("error", () => reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_FAILED")), { once: true });
});

export class IndexedDbPendingIntentStore implements PendingIntentStore {
  readonly #factory: IDBFactory;
  readonly #databaseName: string;
  readonly #clock: MutationClock;
  #database: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbPendingIntentStoreOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error("INDEXED_DB_UNAVAILABLE");
    this.#factory = factory;
    this.#databaseName = options.databaseName ?? "my-bookshelf-mutations";
    this.#clock = options.clock ?? systemClock;
  }

  async #open(): Promise<IDBDatabase> {
    if (this.#database) return this.#database;
    let rejected = false;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.#factory.open(this.#databaseName, 1);
      request.addEventListener("upgradeneeded", () => {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: "storageKey" });
        store.createIndex(ACTOR_INDEX, "actorId", { unique: false });
      }, { once: true });
      request.addEventListener("success", () => {
        if (rejected) {
          request.result.close();
          return;
        }
        const database = request.result;
        database.addEventListener("versionchange", () => {
          database.close();
          if (this.#database === opening) this.#database = null;
        });
        resolve(database);
      }, { once: true });
      request.addEventListener("error", () => {
        rejected = true;
        reject(request.error ?? new Error("INDEXED_DB_OPEN_FAILED"));
      }, { once: true });
      request.addEventListener("blocked", () => {
        rejected = true;
        reject(new Error("INDEXED_DB_OPEN_BLOCKED"));
      }, { once: true });
    });
    this.#database = opening;
    opening.catch(() => {
      if (this.#database === opening) this.#database = null;
    });
    return opening;
  }

  async put(intent: PersistedIntent): Promise<void> {
    if (!isPersistedIntent(intent, undefined, this.#clock.now())) throw new TypeError("PENDING_INTENT_INVALID");
    const transaction = (await this.#open()).transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(toStoredRecord(intent));
    await transactionDone(transaction);
  }

  async get(actorId: string, commandId: string): Promise<PersistedIntent | null> {
    const transaction = (await this.#open()).transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const key = storageKey(actorId, commandId);
    const record = await requestResult(store.get(key)) as unknown;
    if (record === undefined) {
      await transactionDone(transaction);
      return null;
    }
    const intent = validStoredIntent(record, actorId, key, this.#clock.now());
    if (!intent) {
      store.delete(key);
      await transactionDone(transaction);
      return null;
    }
    await transactionDone(transaction);
    return structuredClone(intent);
  }

  async list(actorId: string): Promise<readonly PersistedIntent[]> {
    const transaction = (await this.#open()).transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const keys = await requestResult(store.index(ACTOR_INDEX).getAllKeys(actorId));
    const records = await Promise.all(keys.map(async (key) => ({
      key,
      value: await requestResult(store.get(key)) as unknown,
    })));
    const valid: PersistedIntent[] = [];
    for (const record of records) {
      const key = String(record.key);
      const intent = validStoredIntent(record.value, actorId, key, this.#clock.now());
      if (intent) valid.push(structuredClone(intent));
      else store.delete(record.key);
    }
    await transactionDone(transaction);
    return valid.sort((left, right) => left.storedAt.localeCompare(right.storedAt));
  }

  async delete(actorId: string, commandId: string): Promise<void> {
    const transaction = (await this.#open()).transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const key = storageKey(actorId, commandId);
    const record = await requestResult(store.get(key)) as unknown;
    if (record !== undefined) store.delete(key);
    await transactionDone(transaction);
  }

  async replace(actorId: string, commandId: string, intent: PersistedIntent): Promise<void> {
    if (!isPersistedIntent(intent, actorId, this.#clock.now())) throw new TypeError("PENDING_INTENT_INVALID");
    const transaction = (await this.#open()).transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const previousKey = storageKey(actorId, commandId);
    const nextKey = storageKey(actorId, intent.envelope.commandId);
    const [previous, target] = await Promise.all([
      requestResult(store.get(previousKey)) as Promise<unknown>,
      nextKey === previousKey ? Promise.resolve(undefined) : requestResult(store.get(nextKey)) as Promise<unknown>,
    ]);
    if (!validStoredIntent(previous, actorId, previousKey, this.#clock.now())) {
      if (previous !== undefined) store.delete(previousKey);
      await transactionDone(transaction);
      throw new Error("PENDING_INTENT_NOT_FOUND");
    }
    if (target !== undefined) {
      await transactionDone(transaction);
      throw new Error("PENDING_INTENT_REPLACE_TARGET_EXISTS");
    }
    if (nextKey !== previousKey) store.delete(previousKey);
    store.put(toStoredRecord(intent));
    await transactionDone(transaction);
  }

  async purgeActor(actorId: string): Promise<void> {
    const transaction = (await this.#open()).transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const keys = await requestResult(store.index(ACTOR_INDEX).getAllKeys(actorId));
    for (const key of keys) store.delete(key);
    await transactionDone(transaction);
  }

  close(): void {
    void this.#database?.then((database) => database.close(), () => undefined);
    this.#database = null;
  }
}
