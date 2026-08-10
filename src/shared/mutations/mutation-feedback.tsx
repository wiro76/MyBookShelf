"use client";

import { useEffect, useId, useRef, type RefObject } from "react";

import type { MutationState } from "./mutation-state";

export interface MutationFeedbackProps<TIntent, TConfirmed> {
  state: MutationState<TIntent, TConfirmed>;
  localSummary: string;
  remoteSummary: string;
  onRetry: () => void | Promise<void>;
  onAbandon: () => void | Promise<void>;
  onKeepRemote: () => void | Promise<void>;
  onReapplyLocal: () => void | Promise<void>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function MutationFeedback<TIntent, TConfirmed>({
  state,
  localSummary,
  remoteSummary,
  onRetry,
  onAbandon,
  onKeepRemote,
  onReapplyLocal,
  returnFocusRef: requestedReturnFocusRef,
}: MutationFeedbackProps<TIntent, TConfirmed>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const remoteChoiceRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const actionClaimedRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (state.status !== "conflict") actionClaimedRef.current = false;
  }, [state.status]);

  useEffect(() => {
    if (state.status === "saving" && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
      return;
    }
    if (state.status !== "conflict") return;
    const dialog = dialogRef.current;
    const requestedAtOpen = requestedReturnFocusRef?.current;
    const fallbackAtOpen = returnFocusRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    remoteChoiceRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      const returnFocus = requestedAtOpen?.isConnected
        ? requestedAtOpen
        : fallbackAtOpen?.isConnected ? fallbackAtOpen : null;
      returnFocus?.focus();
    };
  }, [requestedReturnFocusRef, state.status]);

  const claimAction = (action: () => void | Promise<void>) => {
    if (actionClaimedRef.current) return;
    actionClaimedRef.current = true;
    dialogRef.current?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    void Promise.resolve(action()).catch(() => {
      actionClaimedRef.current = false;
      dialogRef.current?.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    });
  };

  if (state.status === "idle") return null;

  if (state.status === "saving") {
    return <p className="mutation-feedback mutation-feedback-pending" role="status" aria-live="polite">Sauvegarde…</p>;
  }

  if (state.status === "saved") {
    return <p className="mutation-feedback mutation-feedback-saved" role="status" aria-live="polite">Enregistré</p>;
  }

  if (state.status === "failed") {
    return (
      <div className="mutation-feedback mutation-feedback-error" role="alert">
        <p>La sauvegarde n&apos;a pas pu être confirmée.</p>
        {state.error.retryable ? (
          <button className="mutation-feedback-action" type="button" onClick={onRetry}>Réessayer</button>
        ) : (
          <button className="mutation-feedback-action" type="button" onClick={onAbandon}>Abandonner la modification</button>
        )}
      </div>
    );
  }

  return (
      <dialog
        ref={dialogRef}
        className="mutation-conflict-dialog"
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => event.preventDefault()}
      >
        <h2 id={titleId}>Choisir la version à conserver</h2>
        <p id={descriptionId}>
          Cette modification diffère de la version enregistrée. Tes changements restent disponibles tant que tu n’as pas choisi.
        </p>
        <div className="mutation-conflict-comparison">
          <div>
            <h3>Version enregistrée</h3>
            <p>{remoteSummary}</p>
          </div>
          <div>
            <h3>Tes changements non enregistrés</h3>
            <p>{localSummary}</p>
          </div>
        </div>
        <div className="mutation-conflict-actions">
          <button ref={remoteChoiceRef} className="mutation-feedback-action" type="button" onClick={() => claimAction(onKeepRemote)}>
            Conserver la version enregistrée
          </button>
          <button className="mutation-feedback-action mutation-feedback-action-primary" type="button" onClick={() => claimAction(onReapplyLocal)}>
            Réappliquer mes changements
          </button>
        </div>
      </dialog>
  );
}
