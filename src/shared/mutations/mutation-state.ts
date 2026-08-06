import {
  isMutationReceipt,
  receiptMatches,
  type MutationFailure,
  type MutationReceipt,
  type PersistedIntent,
  type VersionedSnapshot,
} from "./contracts";

export type MutationState<TIntent = unknown, TConfirmed = unknown> =
  | Readonly<{ status: "idle"; confirmed: VersionedSnapshot<TConfirmed> }>
  | Readonly<{ status: "saving"; confirmed: VersionedSnapshot<TConfirmed>; pending: PersistedIntent<TIntent, TConfirmed>; startedAt: number }>
  | Readonly<{ status: "saved"; confirmed: VersionedSnapshot<TConfirmed>; receipt: MutationReceipt; savedAt: number }>
  | Readonly<{ status: "failed"; confirmed: VersionedSnapshot<TConfirmed>; pending: PersistedIntent<TIntent, TConfirmed>; error: MutationFailure }>
  | Readonly<{ status: "conflict"; confirmed: VersionedSnapshot<TConfirmed>; pending: PersistedIntent<TIntent, TConfirmed>; remote: VersionedSnapshot<TConfirmed> }>;

export type MutationEvent<TIntent = unknown, TConfirmed = unknown> =
  | Readonly<{ type: "START"; pending: PersistedIntent<TIntent, TConfirmed>; at: number }>
  | Readonly<{ type: "RECEIPT"; receipt: unknown; at: number }>
  | Readonly<{ type: "FAIL"; commandId: string; error: MutationFailure }>
  | Readonly<{ type: "CONFLICT"; commandId: string; remote: VersionedSnapshot<TConfirmed> }>
  | Readonly<{ type: "ABANDON"; commandId: string }>
  | Readonly<{ type: "RESET" }>;

const pendingOf = <TIntent, TConfirmed>(state: MutationState<TIntent, TConfirmed>) =>
  state.status === "saving" || state.status === "failed" || state.status === "conflict" ? state.pending : null;

export function reduceMutation<TIntent, TConfirmed>(
  state: MutationState<TIntent, TConfirmed>,
  event: MutationEvent<TIntent, TConfirmed>,
): MutationState<TIntent, TConfirmed> {
  if (event.type === "START") {
    return { status: "saving", confirmed: state.confirmed, pending: event.pending, startedAt: event.at };
  }
  if (event.type === "RESET") {
    return pendingOf(state) ? state : { status: "idle", confirmed: state.confirmed };
  }
  const pending = pendingOf(state);
  if (!pending) return state;
  if (event.type === "RECEIPT") {
    if (!isMutationReceipt(event.receipt) || !receiptMatches(pending.envelope, event.receipt)) return state;
    return {
      status: "saved",
      confirmed: {
        value: pending.optimistic,
        versions: event.receipt.resultVersions,
        confirmedAt: event.receipt.confirmedAt,
      },
      receipt: event.receipt,
      savedAt: event.at,
    };
  }
  if (event.commandId !== pending.envelope.commandId) return state;
  if (event.type === "FAIL") return { status: "failed", confirmed: state.confirmed, pending, error: event.error };
  if (event.type === "CONFLICT") return { status: "conflict", confirmed: event.remote, pending, remote: event.remote };
  return { status: "idle", confirmed: state.confirmed };
}

const PRIORITY: Record<MutationState["status"], number> = {
  idle: 0,
  saved: 1,
  saving: 2,
  failed: 3,
  conflict: 4,
};

export function aggregateMutationStatus(states: readonly MutationState[]): MutationState["status"] {
  let selected: MutationState["status"] = "idle";
  for (const state of states) if (PRIORITY[state.status] > PRIORITY[selected]) selected = state.status;
  return selected;
}
