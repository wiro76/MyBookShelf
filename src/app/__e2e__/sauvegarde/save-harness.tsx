"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  IndexedDbPendingIntentStore,
  MutationCoordinator,
  PENDING_INTENT_SCHEMA_VERSION,
  createUuidV7,
  type CommandEnvelope,
  type MutationState,
  type PersistedIntent,
  type VersionedSnapshot,
} from "@/shared/mutations";
import { MutationFeedback } from "@/shared/mutations/mutation-feedback";

type HarnessScenario = "success" | "failure" | "conflict" | "rejected";
type HarnessIntent = { value: "local" };
type HarnessValue = { entries: readonly string[]; label: string };

const ACTOR_ID = "80000000-0000-4000-8000-000000000001";
const AGGREGATE_ID = "81000000-0000-4000-8000-000000000001";
const AGGREGATE_KEY = `test:${AGGREGATE_ID}`;
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const entries = Array.from({ length: 100 }, (_, index) => `Élément générique ${index + 1}`);

declare global {
  interface Window {
    __mutationHarness?: {
      activeCommandId?: string;
      sentCommandIds: string[];
      pendingCount: () => Promise<number>;
    };
    __saveBudget?: { startedAt: number; savingAt?: number; savedAt?: number };
  }
}

const snapshot = (label: string, revision: number): VersionedSnapshot<HarnessValue> => ({
  value: { entries, label },
  versions: { test: revision },
  confirmedAt: new Date().toISOString(),
});

const commandIdOf = (state: MutationState<HarnessIntent, HarnessValue>) => {
  if (state.status === "saving" || state.status === "failed" || state.status === "conflict") {
    return state.pending.envelope.commandId;
  }
  return state.status === "saved" ? state.receipt.commandId : undefined;
};

export function SaveHarness({ scenario: serverScenario }: { scenario: Exclude<HarnessScenario, "rejected"> }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const coordinatorRef = useRef<MutationCoordinator<HarnessIntent, HarnessValue> | null>(null);
  const initial = useMemo(() => snapshot("Version enregistrée initiale", 1), []);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<MutationState<HarnessIntent, HarnessValue>>({ status: "idle", confirmed: initial });
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [sendCount, setSendCount] = useState(0);

  useEffect(() => {
    let disposed = false;
    const parameters = new URLSearchParams(window.location.search);
    const scenario = parameters.get("scenario") === "rejected" ? "rejected" : serverScenario;
    const databaseName = `my-bookshelf-e2e-${parameters.get("db") ?? "default"}`;
    const store = new IndexedDbPendingIntentStore({ databaseName });
    const recoveredCommandIds = new Set<string>();
    let attempts = 0;

    const coordinator = new MutationCoordinator<HarnessIntent, HarnessValue>({
      store,
      onChange(commandId: string, next: MutationState<HarnessIntent, HarnessValue>) {
        if (disposed) return;
        setActiveCommandId(commandId);
        if (window.__mutationHarness) window.__mutationHarness.activeCommandId = commandId;
        setState(next);
      },
      createConflictCommand(previous, remote) {
        return {
          ...previous,
          commandId: createUuidV7(),
          expectedVersions: remote.versions,
          occurredAt: new Date().toISOString(),
        };
      },
      transport: {
        async send(command: CommandEnvelope) {
          attempts += 1;
          window.__mutationHarness?.sentCommandIds.push(command.commandId);
          setSendCount((count) => count + 1);
          await wait(180);
          if (scenario === "failure" && !recoveredCommandIds.has(command.commandId) && attempts === 1) {
            throw new Error("NETWORK_UNAVAILABLE");
          }
          if (scenario === "rejected") {
            return { kind: "failure" as const, error: { code: "SAVE_REJECTED" as const, retryable: false } };
          }
          if (scenario === "conflict" && attempts === 1) return { kind: "conflict" as const };
          return {
            kind: "receipt" as const,
            receipt: {
              commandId: command.commandId,
              commandType: command.commandType,
              status: recoveredCommandIds.has(command.commandId) ? "replayed" as const : "confirmed" as const,
              resultVersions: { test: scenario === "conflict" ? 3 : 2 },
              confirmedAt: new Date().toISOString(),
            },
          };
        },
        async loadConfirmed() {
          return snapshot("Version enregistrée plus récente", 2);
        },
      },
    });

    coordinatorRef.current = coordinator;
    window.__mutationHarness = {
      sentCommandIds: [],
      pendingCount: async () => (await store.list(ACTOR_ID)).length,
    };

    void store.list(ACTOR_ID).then((pending) => {
      if (disposed) return;
      const recovered = pending[0] as PersistedIntent<HarnessIntent, HarnessValue> | undefined;
      if (recovered) {
        const commandId = recovered.envelope.commandId;
        recoveredCommandIds.add(commandId);
        setActiveCommandId(commandId);
        window.__mutationHarness!.activeCommandId = commandId;
        setState({
          status: "failed",
          confirmed: recovered.confirmed,
          pending: recovered,
          error: { code: "SAVE_UNAVAILABLE", retryable: true },
        });
      }
      setReady(true);
    });

    return () => {
      disposed = true;
      coordinatorRef.current = null;
      store.close();
    };
  }, [initial, serverScenario]);

  const submit = () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    const startedAt = performance.now();
    window.__saveBudget = { startedAt };
    const now = new Date();
    const commandId = createUuidV7();
    const envelope: CommandEnvelope<"test.feedback", HarnessIntent> = {
      commandId,
      commandType: "test.feedback",
      actorId: ACTOR_ID,
      aggregateIds: [AGGREGATE_ID],
      expectedVersions: initial.versions,
      payload: { value: "local" },
      occurredAt: now.toISOString(),
    };
    const intent: PersistedIntent<HarnessIntent, HarnessValue> = {
      schemaVersion: PENDING_INTENT_SCHEMA_VERSION,
      aggregateKey: AGGREGATE_KEY,
      envelope,
      confirmed: initial,
      optimistic: { entries, label: "Modification locale" },
      storedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    };
    void coordinator.submit(intent);
  };

  const retry = async () => {
    if (activeCommandId) await coordinatorRef.current?.retry(ACTOR_ID, activeCommandId);
  };
  const abandon = async () => {
    if (!activeCommandId) return;
    await coordinatorRef.current?.abandon(ACTOR_ID, activeCommandId);
    setActiveCommandId(null);
  };
  const keepRemote = async () => {
    if (activeCommandId) await coordinatorRef.current?.keepRemote(ACTOR_ID, activeCommandId);
  };
  const reapplyLocal = async () => {
    if (!activeCommandId) return;
    const next = await coordinatorRef.current?.reapplyLocal(ACTOR_ID, activeCommandId);
    if (next) {
      const nextCommandId = commandIdOf(next);
      if (nextCommandId) setActiveCommandId(nextCommandId);
    }
  };

  const renderedEntries = state.status === "saved" ? state.confirmed.value.entries : initial.value.entries;

  return (
    <main className="save-harness-shell">
      <section className="save-harness" aria-labelledby="save-harness-title">
        <p className="eyebrow">Validation E2E</p>
        <h1 id="save-harness-title">Sauvegarde fiable</h1>
        <p className="save-harness-copy">État générique de 100 éléments, sans donnée métier.</p>
        <button ref={triggerRef} className="mutation-feedback-action mutation-feedback-action-primary" type="button" onClick={submit} disabled={!ready || state.status === "saving"}>
          Tester une sauvegarde
        </button>
        <MutationFeedback
          state={state}
          localSummary="La modification locale sera appliquée à partir de la version récente."
          remoteSummary="La version enregistrée plus récente sera conservée."
          onRetry={retry}
          onAbandon={abandon}
          onKeepRemote={keepRemote}
          onReapplyLocal={reapplyLocal}
          returnFocusRef={triggerRef}
        />
        <output className="save-harness-observation" aria-label="Observation du harnais">
          État : <span data-testid="mutation-state">{state.status}</span>. Envois : <span data-testid="send-count">{sendCount}</span>.
        </output>
        <ul className="save-harness-items" data-testid="generic-items" aria-label="100 éléments génériques">
          {renderedEntries.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
      </section>
    </main>
  );
}
