import {
  isPersistedIntent,
  type MutationClock,
  type PendingIntentStore,
  type PersistedIntent,
} from "./contracts";

const systemClock: MutationClock = { now: () => new Date() };
const clone = <T>(value: T): T => structuredClone(value);
const storageKey = (actorId: string, commandId: string) => `${actorId}:${commandId}`;

export class MemoryPendingIntentStore implements PendingIntentStore {
  readonly #records = new Map<string, PersistedIntent>();
  readonly #clock: MutationClock;

  constructor(clock: MutationClock = systemClock) {
    this.#clock = clock;
  }

  async put(intent: PersistedIntent): Promise<void> {
    if (!isPersistedIntent(intent, undefined, this.#clock.now())) throw new TypeError("PENDING_INTENT_INVALID");
    this.#records.set(storageKey(intent.envelope.actorId, intent.envelope.commandId), clone(intent));
  }

  async get(actorId: string, commandId: string): Promise<PersistedIntent | null> {
    const key = storageKey(actorId, commandId);
    const value = this.#records.get(key);
    if (!value) return null;
    if (!isPersistedIntent(value, undefined, this.#clock.now())) {
      this.#records.delete(key);
      return null;
    }
    if (value.envelope.actorId !== actorId) return null;
    return clone(value);
  }

  async list(actorId: string): Promise<readonly PersistedIntent[]> {
    const result: PersistedIntent[] = [];
    for (const [commandId, value] of this.#records) {
      if (!isPersistedIntent(value, undefined, this.#clock.now())) {
        this.#records.delete(commandId);
      } else if (value.envelope.actorId === actorId) {
        result.push(clone(value));
      }
    }
    return result.sort((left, right) => left.storedAt.localeCompare(right.storedAt));
  }

  async delete(actorId: string, commandId: string): Promise<void> {
    this.#records.delete(storageKey(actorId, commandId));
  }

  async replace(actorId: string, commandId: string, intent: PersistedIntent): Promise<void> {
    if (!isPersistedIntent(intent, actorId, this.#clock.now())) throw new TypeError("PENDING_INTENT_INVALID");
    const previousKey = storageKey(actorId, commandId);
    const previous = this.#records.get(previousKey);
    if (!previous || !isPersistedIntent(previous, actorId, this.#clock.now())) {
      this.#records.delete(previousKey);
      throw new Error("PENDING_INTENT_NOT_FOUND");
    }
    const nextKey = storageKey(actorId, intent.envelope.commandId);
    if (nextKey !== previousKey && this.#records.has(nextKey)) throw new Error("PENDING_INTENT_REPLACE_TARGET_EXISTS");
    this.#records.delete(previousKey);
    this.#records.set(nextKey, clone(intent));
  }

  async purgeActor(actorId: string): Promise<void> {
    for (const [commandId, value] of this.#records) {
      if (value.envelope.actorId === actorId) this.#records.delete(commandId);
    }
  }
}
