import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RELAUNCH = "RELIABLE_MUTATION_TYPE_STRIPPING";
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
const {
  MemoryPendingIntentStore,
  MutationCoordinator,
  MAX_PENDING_INTENT_TTL_MS,
  aggregateMutationStatus,
  canPersistOffline,
  createUuidV7,
  isPersistedIntent,
  reduceMutation,
} = mutations;

const actorId = "80000000-0000-4000-8000-000000000001";
const aggregateId = "81000000-0000-4000-8000-000000000001";
const commandId = "018f1e23-4567-7abc-8def-0123456789ab";
const nextCommandId = "018f1e23-4568-7abc-8def-0123456789ab";
const timestamp = "2026-08-06T08:00:00.000Z";
const later = "2026-08-07T08:00:00.000Z";
const clock = { now: () => new Date(timestamp) };
const snapshot = (value = { title: "distance" }, revision = 1) => ({
  value,
  versions: { shelf: revision },
  confirmedAt: timestamp,
});
const command = (id = commandId, expected = 1) => ({
  commandId: id,
  commandType: "library.rename",
  actorId,
  aggregateIds: [aggregateId],
  expectedVersions: { shelf: expected },
  payload: { title: "local" },
  occurredAt: timestamp,
});
const intent = (id = commandId) => ({
  schemaVersion: 1,
  aggregateKey: `shelf:${aggregateId}`,
  envelope: command(id),
  confirmed: snapshot(),
  optimistic: { title: "local" },
  storedAt: timestamp,
  expiresAt: later,
});
const receipt = (id = commandId) => ({
  commandId: id,
  commandType: "library.rename",
  status: "confirmed",
  resultVersions: { shelf: 2 },
  confirmedAt: timestamp,
});
const deferred = () => {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

test("refuse les intentions avec cles supplementaires, secrets, TTL excessif ou type financier", () => {
  assert.equal(isPersistedIntent({ ...intent(), unexpected: true }, actorId, clock.now()), false);
  assert.equal(isPersistedIntent({
    ...intent(),
    envelope: { ...command(), payload: { title: "local", token: "secret" } },
  }, actorId, clock.now()), false);
  assert.equal(isPersistedIntent({ ...intent(), optimistic: { title: "local", cookie: "secret" } }, actorId, clock.now()), false);
  assert.equal(isPersistedIntent({
    ...intent(),
    expiresAt: new Date(clock.now().getTime() + MAX_PENDING_INTENT_TTL_MS + 1).toISOString(),
  }, actorId, clock.now()), false);
  assert.equal(isPersistedIntent({
    ...intent(),
    storedAt: new Date(clock.now().getTime() + 1).toISOString(),
  }, actorId, clock.now()), false);
  for (const commandType of ["store.purchase", "creditGrant", "reading-reward"]) {
    assert.equal(canPersistOffline(commandType), false);
    assert.equal(isPersistedIntent({
      ...intent(),
      envelope: { ...command(), commandType },
    }, actorId, clock.now()), false);
  }
});

const conflictCoordinator = ({ store = new MemoryPendingIntentStore(clock), createConflictCommand, onChange, remote = snapshot({ title: "remote recente" }, 2) } = {}) => {
  const sent = [];
  const coordinator = new MutationCoordinator({
    store,
    clock,
    onChange,
    createConflictCommand: createConflictCommand ?? ((previous, confirmed) => ({
      ...previous,
      commandId: nextCommandId,
      expectedVersions: confirmed.versions,
      occurredAt: timestamp,
    })),
    transport: {
      async send(envelope) {
        sent.push(structuredClone(envelope));
        return sent.length === 1 ? { kind: "conflict" } : { kind: "receipt", receipt: receipt(envelope.commandId) };
      },
      async loadConfirmed() { return remote; },
    },
  });
  return { coordinator, sent, store, remote };
};

test("genere un UUIDv7 navigateur avec timestamp, version et variante conformes", () => {
  const id = createUuidV7({
    now: () => 0x018f1e234567,
    random: (bytes) => bytes.fill(0xab),
  });
  assert.equal(id, "018f1e23-4567-7bab-abab-abababababab");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("refuse les intentions expirees, d'un autre acteur ou avec une commande non UUIDv7", () => {
  assert.equal(isPersistedIntent(intent(), actorId, new Date(timestamp)), true);
  assert.equal(isPersistedIntent(intent(), "82000000-0000-4000-8000-000000000001", new Date(timestamp)), false);
  assert.equal(isPersistedIntent(intent(), actorId, new Date(later)), false);
  assert.equal(isPersistedIntent({ ...intent(), envelope: { ...command(), commandId: crypto.randomUUID() } }, actorId, new Date(timestamp)), false);
});

test("le reducer ne confirme qu'un recu valide et correle", () => {
  const initial = { status: "idle", confirmed: snapshot() };
  const saving = reduceMutation(initial, { type: "START", pending: intent(), at: 1 });
  assert.equal(saving.status, "saving");
  assert.equal(reduceMutation(saving, { type: "RECEIPT", receipt: null, at: 2 }), saving);
  assert.equal(reduceMutation(saving, { type: "RECEIPT", receipt: receipt(nextCommandId), at: 2 }), saving);
  const saved = reduceMutation(saving, { type: "RECEIPT", receipt: receipt(), at: 2 });
  assert.equal(saved.status, "saved");
  assert.deepEqual(saved.confirmed.value, { title: "local" });
  assert.deepEqual(saved.confirmed.versions, { shelf: 2 });
});

test("RESET ne masque jamais une intention encore active", () => {
  const idle = { status: "idle", confirmed: snapshot() };
  const saving = reduceMutation(idle, { type: "START", pending: intent(), at: 1 });
  const failed = reduceMutation(saving, {
    type: "FAIL", commandId, error: { code: "SAVE_UNAVAILABLE", retryable: true },
  });
  assert.equal(reduceMutation(saving, { type: "RESET" }), saving);
  assert.equal(reduceMutation(failed, { type: "RESET" }), failed);
  assert.deepEqual(reduceMutation(idle, { type: "RESET" }), idle);
});

test("echec et conflit restaurent le confirme et ignorent les reponses tardives", () => {
  const confirmed = snapshot();
  const saving = reduceMutation({ status: "idle", confirmed }, { type: "START", pending: intent(), at: 1 });
  assert.equal(reduceMutation(saving, {
    type: "FAIL", commandId: nextCommandId, error: { code: "SAVE_UNAVAILABLE", retryable: true },
  }), saving);
  const failed = reduceMutation(saving, {
    type: "FAIL", commandId, error: { code: "SAVE_UNAVAILABLE", retryable: true },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.confirmed, confirmed);
  const remote = snapshot({ title: "remote recente" }, 2);
  const conflict = reduceMutation(saving, { type: "CONFLICT", commandId, remote });
  assert.equal(conflict.status, "conflict");
  assert.equal(conflict.confirmed, remote);
  assert.equal(conflict.pending.envelope.payload.title, "local");
});

test("agrege 100 operations selon conflict > failed > saving > saved > idle avec un cout borne", () => {
  const states = Array.from({ length: 100 }, () => ({ status: "saved", confirmed: snapshot(), receipt: receipt(), savedAt: 1 }));
  states[25] = { status: "saving", confirmed: snapshot(), pending: intent(), startedAt: 1 };
  states[50] = { status: "failed", confirmed: snapshot(), pending: intent(), error: { code: "SAVE_UNAVAILABLE", retryable: true } };
  states[75] = { status: "conflict", confirmed: snapshot(), pending: intent(), remote: snapshot() };
  const started = performance.now();
  for (let iteration = 0; iteration < 10_000; iteration += 1) aggregateMutationStatus(states);
  assert.equal(aggregateMutationStatus(states), "conflict");
  assert.ok(performance.now() - started < 500, "10 000 aggregations de 100 operations restent sous 500 ms");
});

test("persiste avant envoi et ne supprime qu'apres un recu correle", async () => {
  const store = new MemoryPendingIntentStore(clock);
  let presentDuringSend = false;
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send(envelope) {
        presentDuringSend = Boolean(await store.get(actorId, envelope.commandId));
        return { kind: "receipt", receipt: receipt() };
      },
      async loadConfirmed() { return snapshot(); },
    },
  });
  const result = await coordinator.submit(intent());
  assert.equal(presentDuringSend, true);
  assert.equal(result.status, "saved");
  assert.equal(await store.get(actorId, commandId), null);
});

test("publie saving avant une persistance lente puis expose un echec du store", async () => {
  const gate = deferred();
  const changes = [];
  const slowStore = {
    async put() { await gate.promise; throw new Error("disk full"); },
    async get() { return null; }, async list() { return []; }, async delete() {}, async replace() {}, async purgeActor() {},
  };
  const coordinator = new MutationCoordinator({
    store: slowStore,
    clock,
    onChange: (id, state) => changes.push([id, state.status]),
    createConflictCommand: () => command(nextCommandId, 2),
    transport: { async send() { throw new Error("must not send"); }, async loadConfirmed() { return snapshot(); } },
  });
  const submission = coordinator.submit(intent());
  assert.deepEqual(changes, [[commandId, "saving"]]);
  gate.resolve();
  const result = await submission;
  assert.equal(result.status, "failed");
  assert.deepEqual(result.error, { code: "SAVE_UNAVAILABLE", retryable: true });
  assert.deepEqual(changes.at(-1), [commandId, "failed"]);
});

test("un recu malforme ou non correle devient un echec reessayable", async () => {
  for (const invalidReceipt of [{ nope: true }, receipt(nextCommandId)]) {
    const store = new MemoryPendingIntentStore(clock);
    const coordinator = new MutationCoordinator({
      store,
      clock,
      createConflictCommand: () => command(nextCommandId, 2),
      transport: {
        async send() { return { kind: "receipt", receipt: invalidReceipt }; },
        async loadConfirmed() { return snapshot(); },
      },
    });
    const result = await coordinator.submit(intent());
    assert.equal(result.status, "failed");
    assert.deepEqual(result.error, { code: "SAVE_UNAVAILABLE", retryable: true });
    assert.ok(await store.get(actorId, commandId));
  }
});

test("un recu valide reste confirme meme si son nettoyage local echoue", async () => {
  class FailingDeleteStore extends MemoryPendingIntentStore {
    async delete() { throw new Error("cleanup failed"); }
  }
  const store = new FailingDeleteStore(clock);
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: { async send() { return { kind: "receipt", receipt: receipt() }; }, async loadConfirmed() { return snapshot(); } },
  });
  assert.equal((await coordinator.submit(intent())).status, "saved");
});

test("refuse un commandId deja revendique sans second envoi", async () => {
  const gate = deferred();
  let sends = 0;
  const coordinator = new MutationCoordinator({
    store: new MemoryPendingIntentStore(clock),
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send() { sends += 1; await gate.promise; return { kind: "receipt", receipt: receipt() }; },
      async loadConfirmed() { return snapshot(); },
    },
  });
  const first = coordinator.submit(intent());
  await assert.rejects(coordinator.submit(intent()), /DUPLICATE_COMMAND_ID/);
  gate.resolve();
  await first;
  assert.equal(sends, 1);
});

test("ne remplace pas une intention restauree par une soumission au meme commandId", async () => {
  const store = new MemoryPendingIntentStore(clock);
  await store.put(intent());
  let sends = 0;
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send() { sends += 1; return { kind: "receipt", receipt: receipt() }; },
      async loadConfirmed() { return snapshot(); },
    },
  });
  const result = await coordinator.submit({ ...intent(), optimistic: { title: "different" } });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.error, { code: "SAVE_COMMAND_REUSED", retryable: false });
  assert.deepEqual((await store.get(actorId, commandId)).optimistic, { title: "local" });
  assert.equal(sends, 0);
});

test("conserve l'enveloppe apres reponse inconnue et la rejoue a l'identique", async () => {
  const store = new MemoryPendingIntentStore(clock);
  const sent = [];
  let fails = true;
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send(envelope) {
        sent.push(structuredClone(envelope));
        if (fails) throw new Error("response lost");
        return { kind: "receipt", receipt: receipt() };
      },
      async loadConfirmed() { return snapshot(); },
    },
  });
  assert.equal((await coordinator.submit(intent())).status, "failed");
  assert.ok(await store.get(actorId, commandId));
  fails = false;
  assert.equal((await coordinator.retry(actorId, commandId)).status, "saved");
  assert.deepEqual(sent[1], sent[0]);
});

test("propage une erreur stable du transport sans produire de faux recu", async () => {
  const store = new MemoryPendingIntentStore(clock);
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send() {
        return { kind: "failure", error: { code: "SAVE_REJECTED", retryable: false } };
      },
      async loadConfirmed() { return snapshot(); },
    },
  });
  const failed = await coordinator.submit(intent());
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.error, { code: "SAVE_REJECTED", retryable: false });
  assert.ok(await store.get(actorId, commandId));
});

test("restaure le distant au conflit puis exige une nouvelle commande pour reappliquer le local", async () => {
  const store = new MemoryPendingIntentStore(clock);
  const sent = [];
  const remote = snapshot({ title: "remote recente" }, 2);
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand(previous, confirmed) {
      return { ...previous, commandId: nextCommandId, expectedVersions: confirmed.versions, occurredAt: timestamp };
    },
    transport: {
      async send(envelope) {
        sent.push(envelope);
        return sent.length === 1 ? { kind: "conflict" } : { kind: "receipt", receipt: receipt(nextCommandId) };
      },
      async loadConfirmed() { return remote; },
    },
  });
  const conflicted = await coordinator.submit(intent());
  assert.equal(conflicted.status, "conflict");
  assert.equal(conflicted.confirmed, remote);
  assert.ok(await store.get(actorId, commandId));
  const reapplied = await coordinator.reapplyLocal(actorId, commandId);
  assert.equal(reapplied.status, "saved");
  assert.equal(sent[1].commandId, nextCommandId);
  assert.deepEqual(sent[1].expectedVersions, { shelf: 2 });
  assert.equal(await store.get(actorId, commandId), null);
});

test("restaure les intentions d'un acteur et les rend reessayables apres redemarrage", async () => {
  const store = new MemoryPendingIntentStore(clock);
  await store.put(intent());
  const changes = [];
  const coordinator = new MutationCoordinator({
    store,
    clock,
    onChange: (id, state) => changes.push([id, state.status]),
    createConflictCommand: () => command(nextCommandId, 2),
    transport: { async send() { return { kind: "receipt", receipt: receipt() }; }, async loadConfirmed() { return snapshot(); } },
  });
  const restored = await coordinator.restore(actorId);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].status, "failed");
  assert.deepEqual(changes[0], [commandId, "failed"]);
  assert.equal((await coordinator.retry(actorId, commandId)).status, "saved");
});

test("protege les arbitrages par acteur et refuse l'abandon pendant un envoi", async () => {
  const wrongActor = "82000000-0000-4000-8000-000000000001";
  const { coordinator, store } = conflictCoordinator();
  assert.equal((await coordinator.submit(intent())).status, "conflict");
  await coordinator.keepRemote(wrongActor, commandId);
  await coordinator.abandon(wrongActor, commandId);
  assert.equal(coordinator.state(commandId).status, "conflict");
  assert.ok(await store.get(actorId, commandId));

  const gate = deferred();
  const activeStore = new MemoryPendingIntentStore(clock);
  const active = new MutationCoordinator({
    store: activeStore,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send() { await gate.promise; return { kind: "receipt", receipt: receipt() }; },
      async loadConfirmed() { return snapshot(); },
    },
  });
  const submission = active.submit(intent());
  await active.abandon(actorId, commandId);
  assert.ok(await activeStore.get(actorId, commandId));
  gate.resolve();
  assert.equal((await submission).status, "saved");
});

test("verrouille la reapplique locale et remplace atomiquement l'ancien conflit", async () => {
  const gate = deferred();
  let replacements = 0;
  let factoryCalls = 0;
  class SlowReplaceStore extends MemoryPendingIntentStore {
    async replace(...args) {
      replacements += 1;
      await gate.promise;
      return super.replace(...args);
    }
  }
  const store = new SlowReplaceStore(clock);
  const { coordinator } = conflictCoordinator({
    store,
    createConflictCommand(previous, remote) {
      factoryCalls += 1;
      return { ...previous, commandId: nextCommandId, expectedVersions: remote.versions, occurredAt: timestamp };
    },
  });
  await coordinator.submit(intent());
  const first = coordinator.reapplyLocal(actorId, commandId);
  const second = coordinator.reapplyLocal(actorId, commandId);
  assert.equal(await second, undefined);
  gate.resolve();
  assert.equal((await first).status, "saved");
  assert.equal(factoryCalls, 1);
  assert.equal(replacements, 1);
  assert.equal(coordinator.state(commandId).status, "idle");
  assert.equal(await store.get(actorId, commandId), null);
});

test("conserve le conflit intact si le remplacement atomique echoue", async () => {
  class FailingReplaceStore extends MemoryPendingIntentStore {
    async replace() { throw new Error("replace failed"); }
  }
  const store = new FailingReplaceStore(clock);
  const { coordinator } = conflictCoordinator({ store });
  await coordinator.submit(intent());
  await assert.rejects(coordinator.reapplyLocal(actorId, commandId), /replace failed/);
  assert.equal(coordinator.state(commandId).status, "conflict");
  assert.ok(await store.get(actorId, commandId));
  assert.equal(await store.get(actorId, nextCommandId), null);
});

test("renouvelle le TTL sans depasser la limite gouvernee", async () => {
  let captured;
  class CapturingStore extends MemoryPendingIntentStore {
    async replace(actor, previousId, next) { captured = next; return super.replace(actor, previousId, next); }
  }
  const mutableClock = { now: () => new Date("2026-08-06T20:00:00.000Z") };
  const store = new CapturingStore(mutableClock);
  const localIntent = { ...intent(), expiresAt: new Date(new Date(timestamp).getTime() + MAX_PENDING_INTENT_TTL_MS).toISOString() };
  const sent = [];
  const coordinator = new MutationCoordinator({
    store,
    clock: mutableClock,
    createConflictCommand: (previous, remote) => ({ ...previous, commandId: nextCommandId, expectedVersions: remote.versions, occurredAt: mutableClock.now().toISOString() }),
    transport: {
      async send(envelope) { sent.push(envelope); return sent.length === 1 ? { kind: "conflict" } : { kind: "receipt", receipt: { ...receipt(nextCommandId), confirmedAt: mutableClock.now().toISOString() } }; },
      async loadConfirmed() { return { ...snapshot({ title: "remote" }, 2), confirmedAt: mutableClock.now().toISOString() }; },
    },
  });
  await coordinator.submit(localIntent);
  await coordinator.reapplyLocal(actorId, commandId);
  const ttl = new Date(captured.expiresAt).getTime() - new Date(captured.storedAt).getTime();
  assert.equal(ttl, MAX_PENDING_INTENT_TTL_MS);
  assert.equal(captured.storedAt, mutableClock.now().toISOString());
});

test("refuse toute commande de conflit qui altere ses invariants", async () => {
  const invalidFactories = [
    (previous, remote) => ({ ...previous, commandId, expectedVersions: remote.versions }),
    (previous, remote) => ({ ...previous, commandId: nextCommandId, actorId: "82000000-0000-4000-8000-000000000001", expectedVersions: remote.versions }),
    (previous, remote) => ({ ...previous, commandId: nextCommandId, commandType: "library.delete", expectedVersions: remote.versions }),
    (previous, remote) => ({ ...previous, commandId: nextCommandId, aggregateIds: [actorId], expectedVersions: remote.versions }),
    (previous, remote) => ({ ...previous, commandId: nextCommandId, payload: { title: "altered" }, expectedVersions: remote.versions }),
    (previous) => ({ ...previous, commandId: nextCommandId, expectedVersions: { shelf: 999 } }),
  ];
  for (const createConflictCommand of invalidFactories) {
    const { coordinator, store } = conflictCoordinator({ createConflictCommand });
    await coordinator.submit(intent());
    await assert.rejects(coordinator.reapplyLocal(actorId, commandId), /CONFLICT_COMMAND_INVALID/);
    assert.equal(coordinator.state(commandId).status, "conflict");
    assert.ok(await store.get(actorId, commandId));
  }
});

test("rejette un snapshot distant malforme et conserve l'intention", async () => {
  const store = new MemoryPendingIntentStore(clock);
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send() { return { kind: "conflict" }; },
      async loadConfirmed() { return { value: { title: "remote" }, versions: {}, confirmedAt: timestamp }; },
    },
  });
  const result = await coordinator.submit(intent());
  assert.equal(result.status, "failed");
  assert.deepEqual(result.error, { code: "SAVE_UNAVAILABLE", retryable: true });
  assert.ok(await store.get(actorId, commandId));
});

test("serialise les transports d'un meme agregat", async () => {
  const store = new MemoryPendingIntentStore(clock);
  let active = 0;
  let maximum = 0;
  const coordinator = new MutationCoordinator({
    store,
    clock,
    createConflictCommand: () => command(nextCommandId, 2),
    transport: {
      async send(envelope) {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
        active -= 1;
        return { kind: "receipt", receipt: receipt(envelope.commandId) };
      },
      async loadConfirmed() { return snapshot(); },
    },
  });
  await Promise.all([coordinator.submit(intent()), coordinator.submit(intent(nextCommandId))]);
  assert.equal(maximum, 1);
});
}
