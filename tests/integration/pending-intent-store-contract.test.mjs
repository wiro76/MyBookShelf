import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "PENDING_STORE_TYPE_STRIPPING";
const fileExists = (path) => {
  try { return statSync(path).isFile(); } catch { return false; }
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const candidate = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      for (const path of [candidate, `${candidate}.ts`, resolve(candidate, "index.ts")]) {
        if (fileExists(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

let mutations = null;
try {
  mutations = await import(pathToFileURL(resolve(ROOT, "src/shared/mutations/index.ts")).href);
} catch (error) {
  const strippingError = error?.code === "ERR_UNKNOWN_FILE_EXTENSION" || /Unknown file extension "\.ts"/.test(String(error?.message ?? ""));
  if (process.env[RELAUNCH] || !strippingError) throw error;
  const env = { ...process.env, [RELAUNCH]: "1" };
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], { stdio: "inherit", env });
  process.exitCode = child.status ?? 1;
}

if (mutations) {
const { IndexedDbPendingIntentStore, MemoryPendingIntentStore } = mutations;
const actorA = "80000000-0000-4000-8000-000000000001";
const actorB = "80000000-0000-4000-8000-000000000002";
const commandA = "018f1e23-4567-7abc-8def-0123456789ab";
const commandB = "018f1e23-4568-7abc-8def-0123456789ab";
const commandC = "018f1e23-4569-7abc-8def-0123456789ab";
let now = new Date("2026-08-06T08:00:00.000Z");
const clock = { now: () => now };
const makeIntent = (actorId, commandId) => ({
  schemaVersion: 1,
  aggregateKey: `library:${actorId}`,
  envelope: {
    commandId,
    commandType: "library.update",
    actorId,
    aggregateIds: [actorId],
    expectedVersions: { library: 1 },
    payload: { selection: "reading" },
    occurredAt: "2026-08-06T08:00:00.000Z",
  },
  confirmed: {
    value: { selection: "finished" },
    versions: { library: 1 },
    confirmedAt: "2026-08-06T08:00:00.000Z",
  },
  optimistic: { selection: "reading" },
  storedAt: "2026-08-06T08:00:00.000Z",
  expiresAt: "2026-08-07T08:00:00.000Z",
});

class FakeRequest extends EventTarget {
  result = undefined;
  error = null;

  succeed(result) {
    this.result = result;
    queueMicrotask(() => this.dispatchEvent(new Event("success")));
  }

  fail(error = new Error("INDEXED_DB_OPEN_FAILED")) {
    this.error = error;
    queueMicrotask(() => this.dispatchEvent(new Event("error")));
  }
}

class FakeTransaction extends EventTarget {
  error = null;
  #records;
  #scheduled = false;

  constructor(records) {
    super();
    this.#records = records;
  }

  objectStore() {
    return new FakeObjectStore(this.#records, this);
  }

  completeSoon() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    setTimeout(() => this.dispatchEvent(new Event("complete")), 0);
  }
}

class FakeIndex {
  #records;
  #transaction;

  constructor(records, transaction) {
    this.#records = records;
    this.#transaction = transaction;
  }

  getAll(actorId) {
    const request = new FakeRequest();
    request.succeed([...this.#records.values()].filter((record) => record?.actorId === actorId).map((record) => structuredClone(record)));
    this.#transaction.completeSoon();
    return request;
  }

  getAllKeys(actorId) {
    const request = new FakeRequest();
    request.succeed([...this.#records].filter(([, record]) => record?.actorId === actorId).map(([key]) => key));
    this.#transaction.completeSoon();
    return request;
  }
}

class FakeObjectStore {
  #records;
  #transaction;

  constructor(records, transaction) {
    this.#records = records;
    this.#transaction = transaction;
  }

  createIndex() {}

  put(record) {
    this.#records.set(record.storageKey, structuredClone(record));
    this.#transaction.completeSoon();
  }

  get(commandId) {
    const request = new FakeRequest();
    const record = this.#records.get(commandId);
    request.succeed(record ? structuredClone(record) : undefined);
    this.#transaction.completeSoon();
    return request;
  }

  delete(commandId) {
    this.#records.delete(commandId);
    this.#transaction.completeSoon();
  }

  index() {
    return new FakeIndex(this.#records, this.#transaction);
  }
}

class FakeDatabase extends EventTarget {
  #records;
  closeCalls = 0;

  constructor(records) {
    super();
    this.#records = records;
  }

  createObjectStore() {
    return new FakeObjectStore(this.#records, { completeSoon() {} });
  }

  transaction() {
    return new FakeTransaction(this.#records);
  }

  seed(key, value) {
    this.#records.set(key, structuredClone(value));
  }

  raw(key) {
    return this.#records.get(key);
  }

  close() {
    this.closeCalls += 1;
  }
}

class FakeIndexedDbFactory {
  #databases = new Map();
  failNextOpen = false;

  open(name) {
    const request = new FakeRequest();
    setTimeout(() => {
      if (this.failNextOpen) {
        this.failNextOpen = false;
        request.fail();
        return;
      }
      let database = this.#databases.get(name);
      if (!database) {
        database = new FakeDatabase(new Map());
        this.#databases.set(name, database);
        request.result = database;
        request.dispatchEvent(new Event("upgradeneeded"));
      }
      request.succeed(database);
    }, 0);
    return request;
  }

  seed(name, key, value) {
    const database = this.#databases.get(name);
    if (!database) throw new Error("FAKE_DATABASE_NOT_OPEN");
    database.seed(key, value);
  }

  raw(name, key) {
    return this.#databases.get(name)?.raw(key);
  }

  database(name) {
    return this.#databases.get(name);
  }
}

const exerciseContract = (name, createStore) => {
  test(`${name}: persiste, isole les comptes, supprime et purge`, async () => {
    now = new Date("2026-08-06T08:00:00.000Z");
    const store = createStore();
    await store.put(makeIntent(actorA, commandA));
    await store.put(makeIntent(actorB, commandB));
    assert.equal((await store.list(actorA)).length, 1);
    assert.equal((await store.list(actorB)).length, 1);
    assert.equal(await store.get(actorB, commandA), null);
    await store.delete(actorB, commandA);
    assert.ok(await store.get(actorA, commandA), "un autre acteur ne peut pas supprimer l'intention");
    await store.purgeActor(actorA);
    assert.equal(await store.get(actorA, commandA), null);
    assert.ok(await store.get(actorB, commandB));
    store.close?.();
  });

  test(`${name}: refuse l'ecriture invalide et purge une intention expiree a la lecture`, async () => {
    now = new Date("2026-08-06T08:00:00.000Z");
    const store = createStore();
    await assert.rejects(() => store.put({ ...makeIntent(actorA, commandA), schemaVersion: 2 }), /PENDING_INTENT_INVALID/);
    await store.put(makeIntent(actorA, commandA));
    now = new Date("2026-08-08T08:00:00.000Z");
    assert.equal(await store.get(actorA, commandA), null);
    assert.deepEqual(await store.list(actorA), []);
    store.close?.();
  });

  test(`${name}: remplace atomiquement une intention sans franchir la frontiere acteur`, async () => {
    now = new Date("2026-08-06T08:00:00.000Z");
    const store = createStore();
    const replacement = {
      ...makeIntent(actorA, commandC),
      optimistic: { selection: "wishlist" },
    };
    await store.put(makeIntent(actorA, commandA));
    await assert.rejects(
      () => store.replace(actorB, commandA, makeIntent(actorB, commandC)),
      /PENDING_INTENT_NOT_FOUND/,
    );
    assert.ok(await store.get(actorA, commandA), "l'acteur erroné ne remplace pas l'intention");
    await store.replace(actorA, commandA, replacement);
    assert.equal(await store.get(actorA, commandA), null);
    assert.deepEqual(await store.get(actorA, commandC), replacement);
    store.close?.();
  });
};

exerciseContract("store memoire", () => new MemoryPendingIntentStore(clock));

const indexedDB = new FakeIndexedDbFactory();
let databaseSequence = 0;
exerciseContract("store IndexedDB natif", () => new IndexedDbPendingIntentStore({
  indexedDB,
  databaseName: `pending-intents-contract-${databaseSequence += 1}`,
  clock,
}));

test("IndexedDB conserve l'intention apres fermeture et reouverture", async () => {
  now = new Date("2026-08-06T08:00:00.000Z");
  const databaseName = "pending-intents-reopen";
  const first = new IndexedDbPendingIntentStore({ indexedDB, databaseName, clock });
  await first.put(makeIntent(actorA, commandA));
  first.close();
  const reopened = new IndexedDbPendingIntentStore({ indexedDB, databaseName, clock });
  assert.deepEqual(await reopened.get(actorA, commandA), makeIntent(actorA, commandA));
  reopened.close();
});

test("IndexedDB natif echoue explicitement quand l'API navigateur est absente", () => {
  assert.throws(() => new IndexedDbPendingIntentStore({ indexedDB: undefined }), /INDEXED_DB_UNAVAILABLE/);
});

test("IndexedDB purge sans exception les valeurs primitives et les enregistrements aux cles non exactes", async () => {
  now = new Date("2026-08-06T08:00:00.000Z");
  const databaseName = "pending-intents-corruption";
  const store = new IndexedDbPendingIntentStore({ indexedDB, databaseName, clock });
  await store.put(makeIntent(actorA, commandA));
  const keyA = `${actorA}:${commandA}`;
  indexedDB.seed(databaseName, keyA, 42);
  assert.equal(await store.get(actorA, commandA), null);
  assert.equal(indexedDB.raw(databaseName, keyA), undefined);

  await store.put(makeIntent(actorA, commandA));
  indexedDB.seed(databaseName, keyA, { ...indexedDB.raw(databaseName, keyA), unexpected: "secret" });
  assert.deepEqual(await store.list(actorA), []);
  assert.equal(indexedDB.raw(databaseName, keyA), undefined);
  store.close();
});

test("IndexedDB retente une ouverture apres un echec temporaire", async () => {
  now = new Date("2026-08-06T08:00:00.000Z");
  const retryingFactory = new FakeIndexedDbFactory();
  retryingFactory.failNextOpen = true;
  const store = new IndexedDbPendingIntentStore({
    indexedDB: retryingFactory,
    databaseName: "pending-intents-open-retry",
    clock,
  });
  await assert.rejects(() => store.list(actorA), /INDEXED_DB_OPEN_FAILED/);
  await store.put(makeIntent(actorA, commandA));
  assert.deepEqual(await store.get(actorA, commandA), makeIntent(actorA, commandA));
  store.close();
});

test("IndexedDB ferme la connexion sur versionchange et la rouvre ensuite", async () => {
  now = new Date("2026-08-06T08:00:00.000Z");
  const databaseName = "pending-intents-versionchange";
  const store = new IndexedDbPendingIntentStore({ indexedDB, databaseName, clock });
  await store.put(makeIntent(actorA, commandA));
  const database = indexedDB.database(databaseName);
  database.dispatchEvent(new Event("versionchange"));
  assert.equal(database.closeCalls, 1);
  assert.deepEqual(await store.get(actorA, commandA), makeIntent(actorA, commandA));
  store.close();
});
}
