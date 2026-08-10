import {
  isCommandEnvelope,
  isMutationReceipt,
  isVersionedSnapshot,
  MAX_PENDING_INTENT_TTL_MS,
  receiptMatches,
  type ConflictCommandFactory,
  type MutationClock,
  type MutationFailure,
  type MutationTransport,
  type PendingIntentStore,
  type PersistedIntent,
} from "./contracts";
import { reduceMutation, type MutationState } from "./mutation-state";

export interface MutationCoordinatorOptions<TIntent, TConfirmed> {
  transport: MutationTransport<TConfirmed>;
  store: PendingIntentStore;
  clock?: MutationClock;
  createConflictCommand: ConflictCommandFactory<TIntent, TConfirmed>;
  onChange?: (commandId: string, state: MutationState<TIntent, TConfirmed>) => void;
}

const unavailable: MutationFailure = { code: "SAVE_UNAVAILABLE", retryable: true };
const systemClock: MutationClock = { now: () => new Date() };
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

export class MutationCoordinator<TIntent, TConfirmed> {
  readonly #transport: MutationTransport<TConfirmed>;
  readonly #store: PendingIntentStore;
  readonly #clock: MutationClock;
  readonly #createConflictCommand: ConflictCommandFactory<TIntent, TConfirmed>;
  readonly #onChange?: (commandId: string, state: MutationState<TIntent, TConfirmed>) => void;
  readonly #states = new Map<string, MutationState<TIntent, TConfirmed>>();
  readonly #queues = new Map<string, Promise<void>>();
  readonly #arbitrations = new Set<string>();

  constructor(options: MutationCoordinatorOptions<TIntent, TConfirmed>) {
    this.#transport = options.transport;
    this.#store = options.store;
    this.#clock = options.clock ?? systemClock;
    this.#createConflictCommand = options.createConflictCommand;
    this.#onChange = options.onChange;
  }

  state(commandId: string): MutationState<TIntent, TConfirmed> | undefined {
    return this.#states.get(commandId);
  }

  async submit(intent: PersistedIntent<TIntent, TConfirmed>): Promise<MutationState<TIntent, TConfirmed>> {
    const commandId = intent.envelope.commandId;
    if (this.#states.has(commandId)) throw new Error("DUPLICATE_COMMAND_ID");
    this.#set(intent.envelope.commandId, {
      status: "saving",
      confirmed: intent.confirmed,
      pending: intent,
      startedAt: this.#clock.now().getTime(),
    });
    try {
      const existing = await this.#store.get(intent.envelope.actorId, commandId);
      if (existing) {
        const current = this.#states.get(commandId)!;
        const failed = reduceMutation(current, {
          type: "FAIL",
          commandId,
          error: { code: "SAVE_COMMAND_REUSED", retryable: false },
        });
        this.#set(commandId, failed);
        return failed;
      }
      await this.#store.put(intent as PersistedIntent);
    } catch {
      const current = this.#states.get(commandId)!;
      const failed = reduceMutation(current, { type: "FAIL", commandId, error: unavailable });
      this.#set(commandId, failed);
      return failed;
    }
    await this.#enqueue(intent.aggregateKey, () => this.#send(intent));
    return this.#states.get(commandId)!;
  }

  async restore(actorId: string): Promise<readonly MutationState<TIntent, TConfirmed>[]> {
    const intents = await this.#store.list(actorId) as readonly PersistedIntent<TIntent, TConfirmed>[];
    const restored: MutationState<TIntent, TConfirmed>[] = [];
    for (const intent of intents) {
      if (intent.envelope.actorId !== actorId || this.#states.has(intent.envelope.commandId)) continue;
      const state: MutationState<TIntent, TConfirmed> = {
        status: "failed",
        confirmed: intent.confirmed,
        pending: intent,
        error: unavailable,
      };
      this.#set(intent.envelope.commandId, state);
      restored.push(state);
    }
    return restored;
  }

  async retry(actorId: string, commandId: string): Promise<MutationState<TIntent, TConfirmed> | undefined> {
    const known = this.#states.get(commandId);
    if (known?.status === "saving") return known;
    if (known?.status === "conflict") return known;
    const knownPending = known?.status === "failed" ? known.pending : null;
    if (knownPending && knownPending.envelope.actorId !== actorId) return undefined;
    const intent = await this.#store.get(actorId, commandId) as PersistedIntent<TIntent, TConfirmed> | null;
    if (!intent) return undefined;
    const current = this.#states.get(commandId) ?? { status: "idle" as const, confirmed: intent.confirmed };
    this.#set(commandId, reduceMutation(current, { type: "START", pending: intent, at: this.#clock.now().getTime() }));
    await this.#enqueue(intent.aggregateKey, () => this.#send(intent));
    return this.#states.get(commandId);
  }

  async keepRemote(actorId: string, commandId: string): Promise<void> {
    const state = this.#states.get(commandId);
    if (state?.status !== "conflict" || state.pending.envelope.actorId !== actorId || this.#arbitrations.has(commandId)) return;
    this.#arbitrations.add(commandId);
    try {
      await this.#store.delete(actorId, commandId);
      this.#set(commandId, { status: "idle", confirmed: state.remote });
    } finally {
      this.#arbitrations.delete(commandId);
    }
  }

  async reapplyLocal(actorId: string, commandId: string): Promise<MutationState<TIntent, TConfirmed> | undefined> {
    const state = this.#states.get(commandId);
    if (state?.status !== "conflict" || state.pending.envelope.actorId !== actorId || this.#arbitrations.has(commandId)) return undefined;
    this.#arbitrations.add(commandId);
    try {
      const command = this.#createConflictCommand(state.pending.envelope, state.remote);
      this.#assertConflictCommand(state.pending.envelope, command, state.remote, commandId);
      if (this.#states.has(command.commandId)) throw new Error("DUPLICATE_COMMAND_ID");
      const now = this.#clock.now();
      const previousTtl = new Date(state.pending.expiresAt).getTime() - new Date(state.pending.storedAt).getTime();
      const ttl = Math.min(Math.max(previousTtl, 1), MAX_PENDING_INTENT_TTL_MS);
      const nextIntent: PersistedIntent<TIntent, TConfirmed> = {
        ...state.pending,
        envelope: command,
        confirmed: state.remote,
        storedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttl).toISOString(),
      };
      await this.#store.replace(actorId, commandId, nextIntent as PersistedIntent);
      this.#set(commandId, { status: "idle", confirmed: state.remote });
      this.#set(command.commandId, {
        status: "saving",
        confirmed: state.remote,
        pending: nextIntent,
        startedAt: now.getTime(),
      });
      await this.#enqueue(nextIntent.aggregateKey, () => this.#send(nextIntent));
      return this.#states.get(command.commandId);
    } finally {
      this.#arbitrations.delete(commandId);
    }
  }

  async abandon(actorId: string, commandId: string): Promise<void> {
    const state = this.#states.get(commandId);
    if (!state || state.status === "saving" || state.status === "saved" || state.status === "idle" ||
      state.pending.envelope.actorId !== actorId || this.#arbitrations.has(commandId)) return;
    await this.#store.delete(actorId, commandId);
    this.#set(commandId, { status: "idle", confirmed: state.confirmed });
  }

  async #send(intent: PersistedIntent<TIntent, TConfirmed>): Promise<void> {
    const commandId = intent.envelope.commandId;
    try {
      const result = await this.#transport.send(intent.envelope);
      const current = this.#states.get(commandId);
      if (!current || (current.status !== "saving" && current.status !== "failed")) return;
      if (result.kind === "receipt") {
        if (!isMutationReceipt(result.receipt) || !receiptMatches(intent.envelope, result.receipt)) {
          this.#set(commandId, reduceMutation(current, { type: "FAIL", commandId, error: unavailable }));
          return;
        }
        const next = reduceMutation(current, { type: "RECEIPT", receipt: result.receipt, at: this.#clock.now().getTime() });
        if (next.status !== "saved") {
          this.#set(commandId, reduceMutation(current, { type: "FAIL", commandId, error: unavailable }));
          return;
        }
        this.#set(commandId, next);
        try {
          await this.#store.delete(intent.envelope.actorId, commandId);
        } catch {
          // The receipt remains authoritative; a later replay can safely repeat cleanup.
        }
        return;
      }
      if (result.kind === "failure") {
        this.#set(commandId, reduceMutation(current, { type: "FAIL", commandId, error: result.error }));
        return;
      }
      const remote = await this.#transport.loadConfirmed(intent.aggregateKey);
      if (!isVersionedSnapshot(remote)) {
        this.#set(commandId, reduceMutation(current, { type: "FAIL", commandId, error: unavailable }));
        return;
      }
      this.#set(commandId, reduceMutation(current, { type: "CONFLICT", commandId, remote }));
    } catch {
      const current = this.#states.get(commandId);
      if (current) this.#set(commandId, reduceMutation(current, { type: "FAIL", commandId, error: unavailable }));
    }
  }

  async #enqueue(aggregateKey: string, operation: () => Promise<void>): Promise<void> {
    const previous = this.#queues.get(aggregateKey) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(operation);
    this.#queues.set(aggregateKey, queued);
    try {
      await queued;
    } finally {
      if (this.#queues.get(aggregateKey) === queued) this.#queues.delete(aggregateKey);
    }
  }

  #set(commandId: string, state: MutationState<TIntent, TConfirmed>): void {
    this.#states.set(commandId, state);
    this.#onChange?.(commandId, state);
  }

  #assertConflictCommand(
    previous: PersistedIntent<TIntent, TConfirmed>["envelope"],
    next: PersistedIntent<TIntent, TConfirmed>["envelope"],
    remote: PersistedIntent<TIntent, TConfirmed>["confirmed"],
    previousCommandId: string,
  ): void {
    if (!isCommandEnvelope(next) || next.commandId === previousCommandId ||
      next.actorId !== previous.actorId || next.commandType !== previous.commandType ||
      canonicalJson(next.aggregateIds) !== canonicalJson(previous.aggregateIds) ||
      canonicalJson(next.payload) !== canonicalJson(previous.payload) ||
      canonicalJson(next.expectedVersions) !== canonicalJson(remote.versions)) {
      throw new Error("CONFLICT_COMMAND_INVALID");
    }
  }
}
