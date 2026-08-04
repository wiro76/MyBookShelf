import { randomFillSync } from "node:crypto";
import type { Pool, PoolClient } from "pg";

/**
 * Worker d'effets différés — story 1.3 (AD-1, AD-12).
 *
 * Ce module contient TOUTE la logique métier de consommation. Le Route Handler HTTP
 * n'en est qu'un adaptateur (AD-2). Il est volontairement autonome : aucun import
 * relatif à l'exécution, uniquement `node:crypto` et des `import type`. Il reste donc
 * importable tel quel depuis un test Node (`node --test`) par effacement de types,
 * sans serveur HTTP ni build préalable.
 *
 * Garanties :
 * - livraison at-least-once, idempotence assurée par `deferred.processed_messages` ;
 * - ordre non garanti globalement (AD-1) ;
 * - la suppression du message n'intervient QUE après le COMMIT de l'effet.
 */

// --- Constantes du contrat -------------------------------------------------

export const DEFERRED_EFFECTS_SCHEMA = "deferred";
export const DEFERRED_EFFECTS_QUEUE = "deferred_effects";
export const DEFERRED_EFFECTS_DEAD_LETTER_QUEUE = "deferred_effects_dlq";

/** `read_ct > 5` ⇒ routage DLQ sans tenter le traitement : exactement 5 tentatives réelles. */
export const RETRY_THRESHOLD = 5;
/** Taille du lot lu à chaque exécution. */
export const BATCH_SIZE = 10;
/** Timeout de visibilité pgmq, en secondes. Bien au-dessus d'un traitement, bien sous `maxDuration`. */
export const VISIBILITY_TIMEOUT_SECONDS = 60;
/** Clé constante du verrou consultatif : sérialisation globale assumée au MVP. */
export const ADVISORY_LOCK_KEY = 4210031003;
/** `maxDuration` du Route Handler, en millisecondes. */
export const MAX_DURATION_MS = 60_000;
/** Marge d'arrêt propre avant expiration de `maxDuration`. */
export const SHUTDOWN_MARGIN_MS = 10_000;
/** Nombre de messages DLQ rejoués par défaut lors d'une reprise. */
export const REPLAY_BATCH_SIZE = 10;

// --- Enveloppes ------------------------------------------------------------

/** Enveloppe AD-1, verbatim. Fixe et versionnée. */
export type DeferredEffectEnvelope = {
  messageId: string;
  eventType: string;
  producer: string;
  aggregateId: string;
  aggregateVersion: number;
  payloadVersion: number;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type DeferredEffectFailureReason = {
  errorCode: string;
  errorMessage: string;
  readCt: number;
  occurredAt: string | null;
};

/** Action de reprise : exécutable, pas décrite en prose. Voir `replayDeadLetteredEffects`. */
export type DeadLetterReplayAction = {
  kind: "replay-to-queue";
  sourceQueue: string;
  targetQueue: string;
  worker: "src/workers/deferred-effects";
  operation: "replayDeadLetteredEffects";
};

/** Enveloppe DLQ : enveloppe d'origine + `jobId` + `failureReason` + `replayAction`. */
export type DeadLetterEnvelope = DeferredEffectEnvelope & {
  jobId: string;
  failureReason: DeferredEffectFailureReason;
  replayAction: DeadLetterReplayAction;
};

/** Enveloppe DLQ d'un message dont l'enveloppe d'origine est illisible. */
export type MalformedDeadLetterEnvelope = {
  jobId: string;
  failureReason: DeferredEffectFailureReason;
  replayAction: DeadLetterReplayAction;
  rawMessage: unknown;
};

export type DeferredEffectMessage = {
  msgId: string;
  readCt: number;
  enqueuedAt: string | null;
  visibleAt: string | null;
  envelope: DeferredEffectEnvelope;
};

// --- Point d'extension : le traitement effectif ----------------------------

export type DeferredEffectHandlerContext = {
  /** Client déjà positionné dans la transaction qui porte l'idempotence. */
  client: PoolClient;
  message: DeferredEffectMessage;
  jobId: string;
};

/**
 * Point d'extension. Cette story ne livre AUCUN effet métier réel : les stories 2.4,
 * 2.6/2.7, 5.3 et 5.5 brancheront le leur ici. Le handler s'exécute dans la même
 * transaction que l'insertion dans `deferred.processed_messages` : lever une erreur
 * annule l'effet ET l'idempotence, et le message reste en file.
 */
export type DeferredEffectHandler = (context: DeferredEffectHandlerContext) => Promise<void>;

/** Handler par défaut, inoffensif : accuse réception sans produire d'effet. */
export const noopDeferredEffectHandler: DeferredEffectHandler = () => Promise.resolve();

// --- Résultats -------------------------------------------------------------

export type ProcessDeferredEffectsResult = {
  jobId: string;
  /** `true` quand le verrou consultatif n'a pas été obtenu : une autre exécution est en cours. */
  skipped: boolean;
  reason: string | null;
  read: number;
  processed: number;
  duplicated: number;
  deadLettered: number;
  failed: number;
  stoppedForTime: boolean;
  durationMs: number;
};

export type ReplayDeadLetteredEffectsResult = {
  jobId: string;
  skipped: boolean;
  reason: string | null;
  read: number;
  replayed: number;
  discarded: number;
  messageIds: string[];
};

export type ProcessDeferredEffectsOptions = {
  /** Pool `pg` ou client déjà emprunté. Un client fourni n'est jamais libéré par le worker. */
  connection: Pool | PoolClient;
  jobId: string;
  handler?: DeferredEffectHandler;
  queue?: string;
  deadLetterQueue?: string;
  batchSize?: number;
  visibilityTimeoutSeconds?: number;
  retryThreshold?: number;
  maxDurationMs?: number;
  shutdownMarginMs?: number;
  /** Backoff explicite après échec (`pgmq.set_vt`). Sinon on laisse le VT expirer. */
  retryBackoffSeconds?: number;
  now?: () => number;
};

export type ReplayDeadLetteredEffectsOptions = {
  connection: Pool | PoolClient;
  jobId?: string;
  queue?: string;
  deadLetterQueue?: string;
  batchSize?: number;
  visibilityTimeoutSeconds?: number;
  now?: () => number;
};

// --- SQL -------------------------------------------------------------------

const SQL = {
  tryLock: "select pg_try_advisory_lock($1::bigint) as acquired",
  unlock: "select pg_advisory_unlock($1::bigint) as released",
  read: "select msg_id, read_ct, enqueued_at, vt, message from pgmq.read($1, $2, $3)",
  markProcessed:
    "insert into deferred.processed_messages(message_id, processed_at) values ($1::uuid, now()) on conflict (message_id) do nothing",
  recordFailure:
    "insert into deferred.effect_failures(message_id, read_ct, error_code, error_message, occurred_at) values ($1::uuid, $2, $3, $4, now())",
  lastFailure:
    "select read_ct, error_code, error_message, occurred_at from deferred.effect_failures where message_id = $1::uuid order by occurred_at desc, id desc limit 1",
  sendRaw: "select pgmq.send($1, $2::jsonb) as msg_id",
  publish: "select deferred.publish_effect($1, $2::jsonb) as msg_id",
  deleteMessage: "select pgmq.delete($1, $2::bigint) as deleted",
  setVisibilityTimeout: "select msg_id from pgmq.set_vt($1, $2::bigint, $3)",
} as const;

// --- Utilitaires -----------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_MESSAGE_MAX_LENGTH = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPoolClient(connection: Pool | PoolClient): connection is PoolClient {
  return typeof (connection as PoolClient).release === "function";
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/**
 * `crypto.randomUUID()` de Node ne produit que de l'UUIDv4. On génère ici un UUIDv7
 * (RFC 9562) : 48 bits d'horodatage puis aléatoire, ce qui rend les `jobId` triables
 * par date — utile pour la corrélation logs/traces attendue par la story 1.4.
 */
export function createJobId(nowMs: number = Date.now()): string {
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(nowMs, 0, 6);
  randomFillSync(bytes, 6, 10);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Valide l'enveloppe AD-1 complète. Toute enveloppe incomplète est refusée. */
export function parseDeferredEffectEnvelope(raw: unknown): DeferredEffectEnvelope | null {
  if (!isRecord(raw)) return null;
  const { messageId, eventType, producer, aggregateId, aggregateVersion, payloadVersion, occurredAt, payload } = raw;
  if (typeof messageId !== "string" || !UUID_PATTERN.test(messageId)) return null;
  if (typeof eventType !== "string" || eventType.length === 0) return null;
  if (typeof producer !== "string" || producer.length === 0) return null;
  if (typeof aggregateId !== "string" || aggregateId.length === 0) return null;
  if (typeof aggregateVersion !== "number" || !Number.isInteger(aggregateVersion)) return null;
  if (typeof payloadVersion !== "number" || !Number.isInteger(payloadVersion)) return null;
  if (typeof occurredAt !== "string" || occurredAt.length === 0) return null;
  if (!isRecord(payload)) return null;
  return { messageId, eventType, producer, aggregateId, aggregateVersion, payloadVersion, occurredAt, payload };
}

function describeError(error: unknown): { errorCode: string; errorMessage: string } {
  if (isRecord(error)) {
    const code = typeof error.code === "string" && error.code.length > 0 ? error.code : "UNEXPECTED_ERROR";
    const message = typeof error.message === "string" ? error.message : String(error);
    return { errorCode: code, errorMessage: message.slice(0, ERROR_MESSAGE_MAX_LENGTH) };
  }
  return { errorCode: "UNEXPECTED_ERROR", errorMessage: String(error).slice(0, ERROR_MESSAGE_MAX_LENGTH) };
}

function buildReplayAction(deadLetterQueue: string, queue: string): DeadLetterReplayAction {
  return {
    kind: "replay-to-queue",
    sourceQueue: deadLetterQueue,
    targetQueue: queue,
    worker: "src/workers/deferred-effects",
    operation: "replayDeadLetteredEffects",
  };
}

type QueueRow = {
  msg_id: string;
  read_ct: number;
  enqueued_at: unknown;
  vt: unknown;
  message: unknown;
};

// --- Traitement d'un message ----------------------------------------------

type MessageOutcome = "processed" | "duplicated";

/**
 * Ordre non négociable : insertion de l'idempotence ET effet métier dans la même
 * transaction, COMMIT, PUIS SEULEMENT `pgmq.delete`. Supprimer avant le commit perd
 * le message ; supprimer après garantit au pire un rejeu, absorbé par l'idempotence.
 */
async function consumeMessage(
  client: PoolClient,
  queue: string,
  message: DeferredEffectMessage,
  handler: DeferredEffectHandler,
  jobId: string,
): Promise<MessageOutcome> {
  let outcome: MessageOutcome;
  await client.query("BEGIN");
  try {
    const claimed = await client.query(SQL.markProcessed, [message.envelope.messageId]);
    const alreadyProcessed = claimed.rowCount === 0;
    if (alreadyProcessed) {
      outcome = "duplicated";
    } else {
      await handler({ client, message, jobId });
      outcome = "processed";
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Connexion perdue : l'annulation est acquise côté serveur.
    }
    throw error;
  }
  await client.query(SQL.deleteMessage, [queue, message.msgId]);
  return outcome;
}

/** Journalise l'échec dans une transaction SÉPARÉE : le ROLLBACK métier a tout effacé. */
async function recordFailure(
  client: PoolClient,
  messageId: string,
  readCt: number,
  error: unknown,
): Promise<void> {
  const { errorCode, errorMessage } = describeError(error);
  try {
    await client.query("BEGIN");
    await client.query(SQL.recordFailure, [messageId, readCt, errorCode, errorMessage]);
    await client.query("COMMIT");
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Rien de plus à tenter : le message reste en file et sera relu.
    }
  }
}

async function readFailureReason(
  client: PoolClient,
  messageId: string,
  readCt: number,
): Promise<DeferredEffectFailureReason> {
  try {
    const result = await client.query<{
      read_ct: number;
      error_code: string;
      error_message: string;
      occurred_at: unknown;
    }>(SQL.lastFailure, [messageId]);
    const row = result.rows[0];
    if (row) {
      return {
        errorCode: row.error_code,
        errorMessage: row.error_message,
        readCt,
        occurredAt: toIsoString(row.occurred_at),
      };
    }
  } catch {
    // La table d'échecs est inaccessible : on route quand même, avec un motif dégradé.
  }
  return {
    errorCode: "RETRY_THRESHOLD_EXCEEDED",
    errorMessage: "Seuil de tentatives dépassé sans échec journalisé.",
    readCt,
    occurredAt: null,
  };
}

/**
 * pgmq n'a pas de DLQ native. On envoie l'enveloppe DLQ puis on supprime le message
 * d'origine dans la MÊME transaction : les deux opérations sont du SQL Postgres
 * standard, l'atomicité est donc gratuite et il n'existe aucune fenêtre de perte.
 */
async function routeToDeadLetterQueue(
  client: PoolClient,
  queue: string,
  deadLetterQueue: string,
  msgId: string,
  envelope: DeadLetterEnvelope | MalformedDeadLetterEnvelope,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(SQL.sendRaw, [deadLetterQueue, JSON.stringify(envelope)]);
    await client.query(SQL.deleteMessage, [queue, msgId]);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Connexion perdue : le message redeviendra visible à l'expiration du VT.
    }
    throw error;
  }
}

// --- Boucle principale -----------------------------------------------------

/**
 * Consomme un lot borné d'effets différés. Fonction pure vis-à-vis de l'infrastructure :
 * elle reçoit sa connexion en paramètre et ne connaît ni HTTP, ni variables d'environnement.
 */
export async function processDeferredEffects(
  options: ProcessDeferredEffectsOptions,
): Promise<ProcessDeferredEffectsResult> {
  const {
    connection,
    jobId,
    handler = noopDeferredEffectHandler,
    queue = DEFERRED_EFFECTS_QUEUE,
    deadLetterQueue = DEFERRED_EFFECTS_DEAD_LETTER_QUEUE,
    batchSize = BATCH_SIZE,
    visibilityTimeoutSeconds = VISIBILITY_TIMEOUT_SECONDS,
    retryThreshold = RETRY_THRESHOLD,
    maxDurationMs = MAX_DURATION_MS,
    shutdownMarginMs = SHUTDOWN_MARGIN_MS,
    retryBackoffSeconds,
    now = Date.now,
  } = options;

  const startedAt = now();
  const deadline = startedAt + maxDurationMs - shutdownMarginMs;
  const borrowed = !isPoolClient(connection);
  const client = borrowed ? await (connection as Pool).connect() : (connection as PoolClient);

  const result: ProcessDeferredEffectsResult = {
    jobId,
    skipped: false,
    reason: null,
    read: 0,
    processed: 0,
    duplicated: 0,
    deadLettered: 0,
    failed: 0,
    stoppedForTime: false,
    durationMs: 0,
  };

  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(SQL.tryLock, [ADVISORY_LOCK_KEY]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) {
      result.skipped = true;
      result.reason = "advisory-lock-not-acquired";
      return result;
    }

    if (now() >= deadline) {
      result.stoppedForTime = true;
      return result;
    }

    const batch = await client.query<QueueRow>(SQL.read, [queue, visibilityTimeoutSeconds, batchSize]);
    result.read = batch.rows.length;

    for (const row of batch.rows) {
      if (now() >= deadline) {
        // Les messages non traités redeviennent visibles à l'expiration du VT.
        result.stoppedForTime = true;
        break;
      }

      const envelope = parseDeferredEffectEnvelope(row.message);

      if (!envelope) {
        await routeToDeadLetterQueue(client, queue, deadLetterQueue, row.msg_id, {
          jobId,
          failureReason: {
            errorCode: "INVALID_ENVELOPE",
            errorMessage: "Enveloppe AD-1 incomplète ou illisible : le message ne peut pas être traité.",
            readCt: row.read_ct,
            occurredAt: null,
          },
          replayAction: buildReplayAction(deadLetterQueue, queue),
          rawMessage: row.message,
        });
        result.deadLettered += 1;
        continue;
      }

      const message: DeferredEffectMessage = {
        msgId: row.msg_id,
        readCt: row.read_ct,
        enqueuedAt: toIsoString(row.enqueued_at),
        visibleAt: toIsoString(row.vt),
        envelope,
      };

      if (message.readCt > retryThreshold) {
        // Seuil atteint : routage DLQ SANS tenter le traitement.
        const failureReason = await readFailureReason(client, envelope.messageId, message.readCt);
        await routeToDeadLetterQueue(client, queue, deadLetterQueue, message.msgId, {
          ...envelope,
          jobId,
          failureReason,
          replayAction: buildReplayAction(deadLetterQueue, queue),
        });
        result.deadLettered += 1;
        continue;
      }

      try {
        const outcome = await consumeMessage(client, queue, message, handler, jobId);
        if (outcome === "duplicated") result.duplicated += 1;
        else result.processed += 1;
      } catch (error) {
        result.failed += 1;
        await recordFailure(client, envelope.messageId, message.readCt, error);
        if (typeof retryBackoffSeconds === "number") {
          try {
            await client.query(SQL.setVisibilityTimeout, [queue, message.msgId, retryBackoffSeconds]);
          } catch {
            // Backoff explicite impossible : le VT nominal fera foi.
          }
        }
      }
    }

    return result;
  } finally {
    if (locked) {
      try {
        await client.query(SQL.unlock, [ADVISORY_LOCK_KEY]);
      } catch {
        // Le verrou consultatif tombe avec la session.
      }
    }
    if (borrowed) (client as PoolClient).release();
    result.durationMs = now() - startedAt;
  }
}

// --- Action de reprise depuis la DLQ --------------------------------------

/**
 * Action de reprise testable (AC 4) : relit la DLQ et republie chaque enveloppe d'origine
 * sur la queue principale via `deferred.publish_effect`, qui revalide l'enveloppe AD-1.
 * Republication et suppression du message DLQ sont dans la même transaction. Le compteur
 * `read_ct` repart à zéro, l'idempotence de consommation reste la seule protection contre
 * un double effet.
 */
export async function replayDeadLetteredEffects(
  options: ReplayDeadLetteredEffectsOptions,
): Promise<ReplayDeadLetteredEffectsResult> {
  const {
    connection,
    jobId = createJobId(),
    queue = DEFERRED_EFFECTS_QUEUE,
    deadLetterQueue = DEFERRED_EFFECTS_DEAD_LETTER_QUEUE,
    batchSize = REPLAY_BATCH_SIZE,
    visibilityTimeoutSeconds = VISIBILITY_TIMEOUT_SECONDS,
  } = options;

  const borrowed = !isPoolClient(connection);
  const client = borrowed ? await (connection as Pool).connect() : (connection as PoolClient);

  const result: ReplayDeadLetteredEffectsResult = {
    jobId,
    skipped: false,
    reason: null,
    read: 0,
    replayed: 0,
    discarded: 0,
    messageIds: [],
  };

  let locked = false;
  try {
    const lock = await client.query<{ acquired: boolean }>(SQL.tryLock, [ADVISORY_LOCK_KEY]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) {
      result.skipped = true;
      result.reason = "advisory-lock-not-acquired";
      return result;
    }

    const batch = await client.query<QueueRow>(SQL.read, [deadLetterQueue, visibilityTimeoutSeconds, batchSize]);
    result.read = batch.rows.length;

    for (const row of batch.rows) {
      const deadLettered = isRecord(row.message) ? row.message : null;
      const envelope = deadLettered ? parseDeferredEffectEnvelope(deadLettered) : null;
      if (!envelope) {
        // Enveloppe irrécupérable : elle reste en DLQ pour analyse humaine.
        result.discarded += 1;
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(SQL.publish, [queue, JSON.stringify(envelope)]);
        await client.query(SQL.deleteMessage, [deadLetterQueue, row.msg_id]);
        await client.query("COMMIT");
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Connexion perdue : le message DLQ redeviendra visible.
        }
        throw error;
      }

      result.replayed += 1;
      result.messageIds.push(envelope.messageId);
    }

    return result;
  } finally {
    if (locked) {
      try {
        await client.query(SQL.unlock, [ADVISORY_LOCK_KEY]);
      } catch {
        // Le verrou consultatif tombe avec la session.
      }
    }
    if (borrowed) (client as PoolClient).release();
  }
}
