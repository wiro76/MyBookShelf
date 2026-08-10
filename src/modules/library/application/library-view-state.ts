import { createHash } from "node:crypto";

import {
  LibraryViewStateError,
  resolveLibraryViewState,
  validateLibraryResumeTarget,
  type LibraryResumeTarget,
  type StoredLibraryViewState,
} from "../domain/library-view-state";
import { describeError, logger } from "@/shared/observability";
import type { MutationReceipt } from "@/shared/mutations";

export type LibraryViewStateReceipt = {
  commandId: string;
  commandType: "library.view-state.confirm";
  status: "confirmed" | "replayed";
  revision: number;
  confirmedAt: string;
};

export function toLibraryMutationReceipt(receipt: LibraryViewStateReceipt): MutationReceipt {
  return {
    commandId: receipt.commandId,
    commandType: receipt.commandType,
    status: receipt.status,
    resultVersions: { libraryViewState: receipt.revision },
    confirmedAt: receipt.confirmedAt,
  };
}

export type ConfirmLibraryViewStateCommand = {
  commandId: string;
  commandType: "library.view-state.confirm";
  actorId: string;
  aggregateIds: readonly [string];
  expectedVersions: { libraryViewState: number };
  payload: { target: LibraryResumeTarget };
  occurredAt: string;
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
const CONFIRM_OPERATION = "library/confirm-view-state";
const COMMAND_KEYS = [
  "commandId", "commandType", "actorId", "aggregateIds", "expectedVersions", "payload", "occurredAt",
] as const;

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

const canonicalTarget = (target: LibraryResumeTarget): LibraryResumeTarget => ({
  status: target.status,
  moduleId: target.moduleId,
  shelfId: target.shelfId,
  copyId: target.copyId,
  modulePosition: target.modulePosition,
  shelfPosition: target.shelfPosition,
  itemPosition: target.itemPosition,
});

const requestDigest = (command: ConfirmLibraryViewStateCommand) => createHash("sha256").update(JSON.stringify({
  commandId: command.commandId,
  commandType: command.commandType,
  actorId: command.actorId,
  aggregateIds: [...command.aggregateIds],
  expectedVersions: { libraryViewState: command.expectedVersions.libraryViewState },
  payload: { target: canonicalTarget(command.payload.target) },
  occurredAt: command.occurredAt,
})).digest("hex");

const throwStableRepositoryError = (error: unknown): never => {
  if (error instanceof LibraryViewStateError) throw error;
  logger.error("Confirmation du contexte de bibliothèque impossible", {
    operation: CONFIRM_OPERATION,
    outcome: "unavailable",
    ...describeError(error),
  });
  throw new LibraryViewStateError("LIBRARY_VIEW_STATE_UNAVAILABLE");
};

export const resumeTargetIdentifier = (resume: ReturnType<typeof resolveLibraryViewState>): string | null =>
  "target" in resume && resume.target ? resume.target.copyId : null;

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
  const commandRecord = commandValue as Record<string, unknown>;
  if (!hasExactKeys(commandRecord, COMMAND_KEYS)) throw new LibraryViewStateError();
  const command = commandRecord as Partial<ConfirmLibraryViewStateCommand>;
  const expectedRevision = command.expectedVersions?.libraryViewState;
  const occurredAt = typeof command.occurredAt === "string" ? new Date(command.occurredAt) : null;
  if (
    !UUID.test(command.commandId ?? "") || command.commandType !== "library.view-state.confirm" ||
    !UUID.test(command.actorId ?? "") || command.actorId !== userId ||
    !Array.isArray(command.aggregateIds) || command.aggregateIds.length !== 1 || command.aggregateIds[0] !== userId ||
    !command.expectedVersions || !hasExactKeys(command.expectedVersions as unknown as Record<string, unknown>, ["libraryViewState"]) ||
    !Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 0 || Number(expectedRevision) >= Number.MAX_SAFE_INTEGER ||
    !command.payload || !hasExactKeys(command.payload as unknown as Record<string, unknown>, ["target"]) ||
    !occurredAt || !Number.isFinite(occurredAt.getTime())
  ) {
    throw new LibraryViewStateError();
  }
  const target = canonicalTarget(validateLibraryResumeTarget(command.payload.target));
  const normalized: ConfirmLibraryViewStateCommand = {
    commandId: command.commandId!,
    commandType: "library.view-state.confirm",
    actorId: command.actorId!,
    aggregateIds: [userId],
    expectedVersions: { libraryViewState: expectedRevision! },
    payload: { target },
    occurredAt: occurredAt.toISOString(),
  };
  const digest = requestDigest(normalized);
  try {
    const replayed = await repository.replay(userId, normalized.commandId, digest);
    if (replayed) return replayed;
  } catch (error) {
    return throwStableRepositoryError(error);
  }
  const exactTarget = currentTargets.map(validateLibraryResumeTarget).find((candidate) =>
    candidate.status === target.status && candidate.moduleId === target.moduleId && candidate.shelfId === target.shelfId &&
    candidate.copyId === target.copyId && candidate.modulePosition === target.modulePosition &&
    candidate.shelfPosition === target.shelfPosition && candidate.itemPosition === target.itemPosition,
  );
  if (!exactTarget) throw new LibraryViewStateError("LIBRARY_VIEW_STATE_TARGET_MISSING");
  try {
    return await repository.confirm(userId, normalized.commandId, digest, exactTarget, expectedRevision!);
  } catch (error) {
    return throwStableRepositoryError(error);
  }
}
