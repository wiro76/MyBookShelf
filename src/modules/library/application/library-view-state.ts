import { createHash } from "node:crypto";

import {
  LibraryViewStateError,
  resolveLibraryViewState,
  validateLibraryResumeTarget,
  type LibraryResumeTarget,
  type StoredLibraryViewState,
} from "../domain/library-view-state";
import { describeError, logger } from "@/shared/observability";

export type LibraryViewStateReceipt = {
  status: "confirmed" | "replayed";
  revision: number;
  confirmedAt: string;
};

export type ConfirmLibraryViewStateCommand = {
  commandId: string;
  expectedRevision: number;
  target: LibraryResumeTarget;
};

export interface LibraryViewStateRepository {
  load(userId: string): Promise<StoredLibraryViewState | null>;
  replay(userId: string, commandId: string, requestSha256: string): Promise<LibraryViewStateReceipt | null>;
  confirm(
    userId: string,
    commandId: string,
    requestSha256: string,
    target: LibraryResumeTarget,
    expectedRevision: number,
  ): Promise<LibraryViewStateReceipt>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESUME_OPERATION = "library/resume-view-state";

const requestDigest = (command: ConfirmLibraryViewStateCommand) => createHash("sha256").update(JSON.stringify({
  commandId: command.commandId,
  expectedRevision: command.expectedRevision,
  target: command.target,
})).digest("hex");

export async function resumeLibraryContext(
  userId: string,
  targets: readonly LibraryResumeTarget[],
  repository: LibraryViewStateRepository,
) {
  try {
    return resolveLibraryViewState(await repository.load(userId), targets);
  } catch (error) {
    logger.error("Reprise du contexte de bibliothèque impossible", {
      operation: RESUME_OPERATION,
      outcome: "unavailable",
      ...describeError(error),
    });
    return {
      status: "unavailable" as const,
      adjusted: false as const,
      code: "LIBRARY_VIEW_STATE_UNAVAILABLE" as const,
      announcement: null,
    };
  }
}

export async function confirmLibraryContext(
  userId: string,
  commandValue: unknown,
  currentTargets: readonly LibraryResumeTarget[],
  repository: LibraryViewStateRepository,
): Promise<LibraryViewStateReceipt> {
  if (!commandValue || typeof commandValue !== "object" || Array.isArray(commandValue)) throw new LibraryViewStateError();
  const command = commandValue as Partial<ConfirmLibraryViewStateCommand>;
  if (!UUID.test(command.commandId ?? "") || !Number.isSafeInteger(command.expectedRevision) || Number(command.expectedRevision) < 0) {
    throw new LibraryViewStateError();
  }
  const target = validateLibraryResumeTarget(command.target);
  const normalized = { commandId: command.commandId!, expectedRevision: command.expectedRevision!, target };
  const replayed = await repository.replay(userId, normalized.commandId, requestDigest(normalized));
  if (replayed) return replayed;
  const exactTarget = currentTargets.map(validateLibraryResumeTarget).find((candidate) =>
    candidate.status === target.status && candidate.moduleId === target.moduleId && candidate.shelfId === target.shelfId &&
    candidate.copyId === target.copyId && candidate.modulePosition === target.modulePosition &&
    candidate.shelfPosition === target.shelfPosition && candidate.itemPosition === target.itemPosition,
  );
  if (!exactTarget) throw new LibraryViewStateError("LIBRARY_VIEW_STATE_TARGET_MISSING");
  return repository.confirm(userId, normalized.commandId, requestDigest(normalized), exactTarget, normalized.expectedRevision);
}
