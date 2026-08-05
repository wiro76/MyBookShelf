import type { Pool, PoolClient } from "pg";
import { createCorrelationId, describeError, logger } from "@/shared/observability";

/**
 * Worker d'effets différés — story 1.3 (AD-1, AD-12), observabilité story 1.4.
 *
 * Ce module contient TOUTE la logique métier de consommation. Le Route Handler HTTP
 * n'en est qu'un adaptateur (AD-2).
 *
 * ⚠️ DEPUIS LA STORY 1.4, IL A UN IMPORT À L'EXÉCUTION : `@/shared/observability`
 * (`createCorrelationId`, `describeError`, `logger`). Le sens de dépendance est
 * `workers → shared`, jamais l'inverse. L'affirmation précédente — « aucun import
 * relatif à l'exécution, uniquement `node:crypto` » — est donc CADUQUE.
 *
 * Conséquence pour les tests : un `node --test` sur un fichier `.mjs` ne sait résoudre
 * ni l'alias `@/…`, ni les imports relatifs sans extension entre fichiers `.ts`, ni les
 * imports JSON sans attribut de type. `tests/unit/deferred-effects.test.mjs` et
 * `tests/integration/database-outbox-canary.mjs` installent donc le même bloc
 * `registerHooks` (`node:module`) qui fournit ces trois règles. Sans lui, l'import du
 * worker échoue en `ERR_MODULE_NOT_FOUND`.
 *
 * Garanties :
 * - livraison at-least-once, idempotence assurée par `deferred.processed_messages` ;
 * - ordre PAR AGRÉGAT à l'intérieur d'un lot (AD-1), aucun ordre global — voir
 *   `blockedAggregates` dans `processDeferredEffects` pour la garantie exacte et ses limites ;
 * - la suppression du message n'intervient QUE après le COMMIT de l'effet.
 */

// --- Constantes du contrat -------------------------------------------------

/**
 * Nom du worker tel qu'il apparaît dans les journaux et dans l'action de reprise DLQ.
 * C'est une constante du code source, pas une donnée d'exécution : elle est à ce titre
 * dans la liste blanche du logger, sous la clé `worker`.
 */
export const WORKER_NAME = "src/workers/deferred-effects";

export const DEFERRED_EFFECTS_SCHEMA = "deferred";
export const DEFERRED_EFFECTS_QUEUE = "deferred_effects";
export const DEFERRED_EFFECTS_DEAD_LETTER_QUEUE = "deferred_effects_dlq";

/** `read_ct > 5` ⇒ routage DLQ sans tenter le traitement : exactement 5 tentatives réelles. */
export const RETRY_THRESHOLD = 5;
/** Taille du lot lu à chaque exécution. */
export const BATCH_SIZE = 10;
/**
 * Timeout de visibilité pgmq, en secondes.
 *
 * Chaîne temporelle, du plus court au plus long — l'ordre est le contrat :
 *
 *   VT (30 s)  <  deadline (50 s)  <  maxDuration (60 s)
 *   │             │                   │
 *   │             │                   └─ `maxDuration` du Route Handler : au-delà,
 *   │             │                      la plateforme tue le processus sans préavis.
 *   │             └─ `MAX_DURATION_MS - SHUTDOWN_MARGIN_MS` : la boucle cesse de prendre
 *   │                de nouveaux messages et rend son résultat proprement.
 *   └─ un message lu et non traité redevient visible AVANT la fin de l'exécution
 *      courante, donc bien avant le tick suivant du cron.
 *
 * 60 s (valeur précédente) était exactement égal à `maxDuration` : un message lu puis
 * abandonné par un arrêt brutal restait invisible aussi longtemps que la fenêtre entière,
 * et le VT expirait au moment même où la plateforme tuait le worker — aucune marge.
 * 30 s reste très au-dessus d'un traitement nominal (quelques millisecondes) tout en
 * garantissant la revisibilité avant l'expiration de la fenêtre HTTP.
 */
export const VISIBILITY_TIMEOUT_SECONDS = 30;
/** Clé constante du verrou consultatif : sérialisation globale assumée au MVP. */
export const ADVISORY_LOCK_KEY = 4210031003;
/** `maxDuration` du Route Handler, en millisecondes. Voir `VISIBILITY_TIMEOUT_SECONDS`. */
export const MAX_DURATION_MS = 60_000;
/** Marge d'arrêt propre avant expiration de `maxDuration`. Voir `VISIBILITY_TIMEOUT_SECONDS`. */
export const SHUTDOWN_MARGIN_MS = 10_000;
/** Délai de mise à l'écart d'une entrée DLQ irrécupérable dont l'archivage a échoué. */
export const QUARANTINE_VISIBILITY_SECONDS = 3_600;
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
  /** Messages dont le routage DLQ a échoué : ils restent en file et redeviendront visibles. */
  deadLetterFailed: number;
  failed: number;
  /**
   * Messages écartés du lot pour préserver l'ordre par agrégat (AD-1) : un message
   * antérieur du MÊME `aggregateId` n'a pas abouti pendant ce lot. Ils sont restés
   * intacts en file — ni consommés, ni comptés en échec, ni pénalisés par un backoff.
   *
   * Compteur dédié et non silence : sans lui, un agrégat durablement bloqué se
   * traduisait par un lot « lu 10, traité 3 » sans que rien ne dise pourquoi, et la
   * différence entre une file saine et un agrégat en souffrance était invisible.
   */
  skippedForOrder: number;
  stoppedForTime: boolean;
  /**
   * `true` quand du travail reste très probablement en file à la fin de l'exécution :
   * lot revenu plein (`read === batchSize`), arrêt sur deadline, ou messages écartés
   * pour préserver l'ordre par agrégat (`skippedForOrder`). Une exécution ne
   * traite QU'UN lot ; sans cet indicateur, une file saturée et une file vide rendaient
   * exactement la même réponse HTTP 200 et la saturation restait invisible.
   * `false` avec `skipped: true` ne signifie rien : aucun lot n'a été lu.
   */
  hasMore: boolean;
  durationMs: number;
};

export type ReplayDeadLetteredEffectsResult = {
  jobId: string;
  skipped: boolean;
  reason: string | null;
  read: number;
  replayed: number;
  /** Entrées DLQ illisibles rencontrées. Elles ne sont JAMAIS laissées en tête de file. */
  discarded: number;
  /** Entrées illisibles déplacées vers la table d'archive pgmq, pour analyse humaine. */
  archived: number;
  /** Entrées dont le rejeu a échoué : restées en DLQ, elles redeviendront visibles. */
  failed: number;
  /** `true` quand le lot est revenu plein : relancer la reprise pour vider la DLQ. */
  hasMore: boolean;
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
  archiveMessage: "select pgmq.archive($1, $2::bigint) as archived",
} as const;

// --- Utilitaires -----------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ISO-8601 date-heure : `2026-08-05T00:00:00Z`, `2026-08-05T00:00:00.123+02:00`, … */
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|z|[+-]\d{2}:?\d{2})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Validation des options ------------------------------------------------

/**
 * Options incohérentes = erreur de programmation, pas d'aléa d'exploitation. On lève tôt,
 * AVANT d'emprunter une connexion, plutôt que de dégrader silencieusement :
 * `shutdownMarginMs >= maxDurationMs` rendait un `stoppedForTime: true` immédiat à chaque
 * tick, en HTTP 200, indéfiniment ; `batchSize <= 0` faisait un no-op muet ;
 * `retryThreshold < 1` envoyait tout en DLQ dès la première lecture ; un
 * `retryBackoffSeconds` négatif transformait le backoff en boucle chaude qui brûlait les
 * cinq tentatives en quelques millisecondes.
 */
export class DeferredEffectsOptionsError extends Error {
  readonly code = "INVALID_WORKER_OPTIONS";

  constructor(message: string) {
    super(message);
    this.name = "DeferredEffectsOptionsError";
  }
}

function describeOptionValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (value === undefined) return "undefined";
  return typeof value;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DeferredEffectsOptionsError(
      `${name} doit être une chaîne non vide (reçu : ${describeOptionValue(value)}).`,
    );
  }
  return value;
}

/** `Number.isInteger` rejette d'office `NaN`, `Infinity` et les décimaux. */
function requireInteger(name: string, value: unknown, minimum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new DeferredEffectsOptionsError(
      `${name} doit être un entier supérieur ou égal à ${minimum} (reçu : ${describeOptionValue(value)}).`,
    );
  }
  return value;
}

function requireConnection(value: unknown): void {
  if (!isRecord(value) || typeof (value as { query?: unknown }).query !== "function") {
    throw new DeferredEffectsOptionsError(
      `connection doit être un Pool ou un PoolClient pg (reçu : ${describeOptionValue(value)}).`,
    );
  }
}

function requireDistinctQueues(queue: string, deadLetterQueue: string): void {
  if (queue === deadLetterQueue) {
    throw new DeferredEffectsOptionsError(
      `queue et deadLetterQueue doivent être distinctes (reçu : ${JSON.stringify(queue)} pour les deux).`,
    );
  }
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
 * `createJobId` a DÉMÉNAGÉ vers `@/shared/observability` sous le nom
 * `createCorrelationId` (story 1.4) : le même UUIDv7 sert désormais de `requestId`, de
 * `commandId` et de `jobId`, et `shared` ne peut pas dépendre de `workers`.
 *
 * L'export est conservé ici, à l'identique (même signature, même implémentation), parce
 * que le canari outbox et le Route Handler l'appellent par ce nom. Ce n'est pas une
 * duplication : c'est un alias.
 */
export const createJobId = createCorrelationId;

/**
 * `occurredAt` est un instant, pas un mot. Sans cette vérification, `occurredAt: "hier"`
 * traversait toute la chaîne — validation, traitement, enveloppe DLQ — et n'était détecté
 * que par un humain lisant la DLQ, ou jamais.
 */
export function isParsableTimestamp(value: string): boolean {
  const parts = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!parts) return false;
  const [, year, month, day, hour, minute, second] = parts;
  const annee = Number(year);
  const mois = Number(month);
  const jour = Number(day);
  if (mois < 1 || mois > 12 || jour < 1) return false;
  if (Number(hour) > 23 || Number(minute) > 59) return false;
  // 60 est toléré : c'est la seconde intercalaire d'ISO-8601.
  if (second !== undefined && Number(second) > 60) return false;
  /**
   * `Date.parse` NE SUFFIT PAS : V8 accepte `2026-02-30T00:00:00Z` et le reporte
   * silencieusement au 2 mars. On vérifie donc le calendrier réel par aller-retour.
   * `setUTCFullYear` plutôt que `Date.UTC`, qui projetterait les années 0 à 99 sur 1900+.
   */
  const reference = new Date(0);
  reference.setUTCFullYear(annee, mois - 1, jour);
  if (
    reference.getUTCFullYear() !== annee ||
    reference.getUTCMonth() !== mois - 1 ||
    reference.getUTCDate() !== jour
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

/** Valide l'enveloppe AD-1 complète. Toute enveloppe incomplète est refusée. */
export function parseDeferredEffectEnvelope(raw: unknown): DeferredEffectEnvelope | null {
  if (!isRecord(raw)) return null;
  const { messageId, eventType, producer, aggregateId, aggregateVersion, payloadVersion, occurredAt, payload } = raw;
  if (typeof messageId !== "string" || !UUID_PATTERN.test(messageId)) return null;
  if (typeof eventType !== "string" || eventType.length === 0) return null;
  if (typeof producer !== "string" || producer.length === 0) return null;
  // UUID exigé, comme pour messageId : l'architecture impose des UUIDv7 applicatifs et
  // interdit les identifiants fournisseur. Le producteur SQL applique la même règle —
  // toute divergence entre les deux ferait accepter à la publication ce que la
  // consommation refuse, donc partir en DLQ un message que rien n'aurait dû produire.
  if (typeof aggregateId !== "string" || !UUID_PATTERN.test(aggregateId)) return null;
  if (typeof aggregateVersion !== "number" || !Number.isInteger(aggregateVersion)) return null;
  if (typeof payloadVersion !== "number" || !Number.isInteger(payloadVersion)) return null;
  if (typeof occurredAt !== "string" || occurredAt.length === 0) return null;
  if (!isParsableTimestamp(occurredAt)) return null;
  if (!isRecord(payload)) return null;
  return { messageId, eventType, producer, aggregateId, aggregateVersion, payloadVersion, occurredAt, payload };
}

/**
 * `describeError` a DÉMÉNAGÉ vers `@/shared/observability` (story 1.4), avec ses filets
 * `safeStringify` / `safeProperty` et sa borne de 2000 caractères. Même raison que
 * `createJobId` : le logger de `shared` en a besoin, et `shared` ne peut pas dépendre de
 * `workers`. Réexporté ici pour les appelants existants — c'est un alias, pas une copie.
 */
export { describeError };

function buildReplayAction(deadLetterQueue: string, queue: string): DeadLetterReplayAction {
  return {
    kind: "replay-to-queue",
    sourceQueue: deadLetterQueue,
    targetQueue: queue,
    worker: WORKER_NAME,
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

// --- Ordre par agrégat (AD-1) ---------------------------------------------

/**
 * `msg_id` est un `bigserial` Postgres : node-postgres le rend en CHAÎNE, sans quoi les
 * identifiants au-delà de 2^53 seraient silencieusement arrondis. Le tri doit donc être
 * numérique et non lexicographique — `"10" < "9"` en comparaison de chaînes, ce qui
 * inverserait exactement l'ordre qu'on prétend garantir dès le dixième message.
 */
function parseMsgIdOrder(value: unknown): bigint | null {
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

/**
 * `pgmq.read` sélectionne bien `order by msg_id asc ... for update skip locked`, mais
 * l'ordre des lignes RENDUES par un `update ... returning` n'est garanti par aucun
 * contrat Postgres. S'appuyer sur l'ordre observé aujourd'hui reviendrait à faire
 * dépendre un invariant d'architecture d'un détail d'implémentation d'une extension
 * tierce. On retrie donc explicitement, ici, où la garantie est vérifiable.
 *
 * Repli sûr : si UN seul `msg_id` est illisible, on rend le lot dans l'ordre reçu plutôt
 * que d'imposer un ordre arbitraire — un tri partiel serait pire qu'un tri absent.
 * L'index sert de départage stable, `Array.prototype.sort` n'étant stable que depuis
 * ES2019 côté spécification.
 */
function orderRowsByMsgId(rows: readonly QueueRow[]): QueueRow[] {
  const decorees: { row: QueueRow; index: number; order: bigint }[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const order = parseMsgIdOrder(row.msg_id);
    if (order === null) return [...rows];
    decorees.push({ row, index, order });
  }
  decorees.sort((gauche, droite) => {
    if (gauche.order === droite.order) return gauche.index - droite.index;
    return gauche.order < droite.order ? -1 : 1;
  });
  return decorees.map((decoree) => decoree.row);
}

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

/**
 * Libère le verrou consultatif et RETOURNE l'erreur au lieu de la lever : l'appel a lieu
 * depuis un `finally`, où l'erreur d'origine doit primer.
 *
 * L'échec est journalisé bruyamment car il est fatal en silence : tant que la session qui
 * détient le verrou vit, chaque exécution suivante répond `skipped` sans rien traiter.
 * L'appelant détruit la connexion quand elle lui appartient ; quand le client est fourni
 * par l'appelant, c'est à lui de le faire — d'où ce journal.
 */
async function releaseAdvisoryLock(client: PoolClient, jobId: string): Promise<Error | null> {
  try {
    await client.query(SQL.unlock, [ADVISORY_LOCK_KEY]);
    return null;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    // Message LITTÉRAL et champs de la liste blanche uniquement (story 1.4) : l'objet
    // `error` brut n'est plus passé au journal, sa stack pouvant porter des fragments SQL.
    logger.error(
      "Libération du verrou consultatif impossible : la session doit être détruite, sinon toutes les exécutions suivantes seront ignorées.",
      {
        jobId,
        worker: WORKER_NAME,
        operation: "releaseAdvisoryLock",
        ...describeError(error),
      },
    );
    return failure;
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

  // Validation AVANT tout emprunt de connexion : une option incohérente ne doit ni
  // consommer une connexion du Pool, ni prendre le verrou consultatif.
  requireConnection(connection);
  requireNonEmptyString("jobId", jobId);
  requireNonEmptyString("queue", queue);
  requireNonEmptyString("deadLetterQueue", deadLetterQueue);
  requireDistinctQueues(queue, deadLetterQueue);
  requireInteger("batchSize", batchSize, 1);
  requireInteger("visibilityTimeoutSeconds", visibilityTimeoutSeconds, 0);
  requireInteger("retryThreshold", retryThreshold, 1);
  requireInteger("maxDurationMs", maxDurationMs, 1);
  requireInteger("shutdownMarginMs", shutdownMarginMs, 0);
  if (shutdownMarginMs >= maxDurationMs) {
    throw new DeferredEffectsOptionsError(
      `shutdownMarginMs (${shutdownMarginMs}) doit être strictement inférieur à maxDurationMs (${maxDurationMs}) : ` +
        "sinon la deadline est déjà dépassée au démarrage et chaque exécution rend un stoppedForTime immédiat.",
    );
  }
  if (retryBackoffSeconds !== undefined) requireInteger("retryBackoffSeconds", retryBackoffSeconds, 0);
  if (typeof handler !== "function") {
    throw new DeferredEffectsOptionsError(`handler doit être une fonction (reçu : ${describeOptionValue(handler)}).`);
  }
  if (typeof now !== "function") {
    throw new DeferredEffectsOptionsError(`now doit être une fonction (reçu : ${describeOptionValue(now)}).`);
  }

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
    deadLetterFailed: 0,
    failed: 0,
    skippedForOrder: 0,
    stoppedForTime: false,
    hasMore: false,
    durationMs: 0,
  };

  /**
   * Un échec de routage DLQ (queue absente, droits insuffisants, enveloppe trop grosse)
   * ne doit JAMAIS avorter le lot : hors de cette enveloppe, l'erreur remontait au-delà
   * de la boucle, les compteurs de l'exécution étaient perdus, les messages déjà traités
   * n'étaient pas rapportés et le même message empoisonné rebloquait chaque tick du cron.
   * Ici, l'échec est compté, journalisé, et le message — resté en file — redeviendra
   * visible à l'expiration de son timeout de visibilité.
   */
  const tryRouteToDeadLetterQueue = async (
    msgId: string,
    envelope: DeadLetterEnvelope | MalformedDeadLetterEnvelope,
  ): Promise<void> => {
    try {
      await routeToDeadLetterQueue(client, queue, deadLetterQueue, msgId, envelope);
      result.deadLettered += 1;
    } catch (error) {
      result.deadLetterFailed += 1;
      logger.error("Routage DLQ impossible : le message reste en file et redeviendra visible.", {
        jobId,
        msgId,
        queue,
        deadLetterQueue,
        worker: WORKER_NAME,
        operation: "routeToDeadLetterQueue",
        ...describeError(error),
      });
    }
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
      // Aucun lot n'a été lu : l'état réel de la file est inconnu, on le déclare
      // pessimiste plutôt que de laisser croire à une file vide.
      result.stoppedForTime = true;
      result.hasMore = true;
      return result;
    }

    const batch = await client.query<QueueRow>(SQL.read, [queue, visibilityTimeoutSeconds, batchSize]);
    result.read = batch.rows.length;

    /**
     * ORDRE PAR AGRÉGAT (AD-1), appliqué ici et nulle part ailleurs.
     *
     * Ce que cette structure garantit, exactement :
     * les messages du lot sont parcourus par `msg_id` croissant (voir `orderRowsByMsgId`) ;
     * dès qu'un message n'aboutit PAS — échec de traitement, routage DLQ (réussi ou non),
     * seuil de tentatives dépassé — son `aggregateId` entre ici, et tout message suivant
     * du MÊME agrégat est écarté du lot. Écarté veut dire strictement intact : ni
     * `pgmq.delete`, ni `pgmq.set_vt`, ni ligne dans `deferred.effect_failures`, ni
     * incrément de `failed`. Seul `skippedForOrder` bouge. L'arrêt sur deadline, lui,
     * interrompt le lot entier : il ne peut donc pas non plus doubler un message resté
     * derrière lui.
     *
     * D'un lot au suivant, l'ordre repose sur pgmq : `msg_id` est un `bigserial` et
     * `pgmq.read` sert les messages visibles du plus petit `msg_id` au plus grand. Le
     * message bloquant, resté en file, garde donc un `msg_id` inférieur à ses successeurs
     * et sera relu avant eux — à condition que son VT ait expiré, ce qui est assuré par
     * `VISIBILITY_TIMEOUT_SECONDS` (30 s) très inférieur à la période du cron.
     *
     * CE QUE CELA NE COUVRE PAS — à lire avant de s'y fier :
     *
     * 1. Ordre de publication ≠ ordre de `msg_id`. Le `bigserial` est alloué à l'INSERT,
     *    pas au COMMIT : deux producteurs concurrents peuvent obtenir 41 puis 42 et
     *    commiter dans l'ordre inverse. Un lot lu entre les deux commits verra 42 seul,
     *    donc A2 avant A1. Rien ici ne le détecte, et `aggregateVersion` n'est JAMAIS
     *    relu : ni trou, ni inversion, ni doublon de version ne sont vérifiés.
     * 2. Une enveloppe ILLISIBLE ne bloque aucun agrégat : `aggregateId` est précisément
     *    la donnée qu'on n'a pas pu lire. Elle part en DLQ et le lot continue.
     * 3. `pgmq.read` incrémente `read_ct` AVANT toute décision du worker : un message
     *    écarté voit malgré tout son compteur monter. Un agrégat bloqué durablement peut
     *    donc voir ses messages suivants franchir `retryThreshold` et partir en DLQ sans
     *    avoir jamais été tentés. pgmq n'offre aucun moyen de décrémenter `read_ct` ; la
     *    DLQ et son action de reprise restent le filet, et l'ordre y est perdu.
     * 4. La sérialisation entre exécutions est celle du verrou consultatif global
     *    (`ADVISORY_LOCK_KEY`). Deux workers qui n'utiliseraient pas la même clé liraient
     *    deux lots disjoints du même agrégat et cette garantie tomberait entièrement.
     * 5. Aucun ordre n'est offert ENTRE agrégats, ni globalement. C'est le contrat AD-1,
     *    pas une lacune : un agrégat bloqué ne freine aucun autre, le débit est préservé.
     */
    const blockedAggregates = new Set<string>();

    for (const row of orderRowsByMsgId(batch.rows)) {
      if (now() >= deadline) {
        // Les messages non traités redeviennent visibles à l'expiration du VT.
        result.stoppedForTime = true;
        break;
      }

      const envelope = parseDeferredEffectEnvelope(row.message);

      if (!envelope) {
        await tryRouteToDeadLetterQueue(row.msg_id, {
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
        continue;
      }

      // Un prédécesseur du même agrégat n'a pas abouti : on laisse ce message EN FILE,
      // sans y toucher, plutôt que de le doubler. Il sera relu au prochain lot, derrière
      // son prédécesseur qui porte un `msg_id` inférieur.
      if (blockedAggregates.has(envelope.aggregateId)) {
        result.skippedForOrder += 1;
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
        // L'agrégat est bloqué dans les deux issues possibles : routage réussi, car le
        // message part en DLQ et devra être rejoué AVANT ses successeurs ; routage
        // échoué, car le message reste en file et n'a toujours pas abouti.
        blockedAggregates.add(envelope.aggregateId);
        const failureReason = await readFailureReason(client, envelope.messageId, message.readCt);
        await tryRouteToDeadLetterQueue(message.msgId, {
          ...envelope,
          jobId,
          failureReason,
          replayAction: buildReplayAction(deadLetterQueue, queue),
        });
        continue;
      }

      try {
        const outcome = await consumeMessage(client, queue, message, handler, jobId);
        if (outcome === "duplicated") result.duplicated += 1;
        else result.processed += 1;
      } catch (error) {
        result.failed += 1;
        blockedAggregates.add(envelope.aggregateId);
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

    /**
     * Une exécution ne consomme QU'UN lot : borner la durée du tick prime, et une boucle
     * multi-lots relirait ici des messages redevenus visibles (VT 30 s < deadline 50 s),
     * ce qui gonflerait `read_ct` sans échec réel et précipiterait des routages DLQ
     * injustifiés. On rend donc l'information au lieu de la consommer : le lot revenu
     * plein signale une file qui n'est probablement pas vidée, l'arrêt sur deadline
     * signale des messages lus mais non traités. L'appelant (cron, supervision) décide.
     *
     * `skippedForOrder > 0` compte aussi : ces messages sont CERTAINEMENT restés en file,
     * c'est le seul des trois signaux qui ne relève pas de la présomption.
     */
    result.hasMore = batch.rows.length >= batchSize || result.stoppedForTime || result.skippedForOrder > 0;

    return result;
  } finally {
    const unlockError = locked ? await releaseAdvisoryLock(client, jobId) : null;
    // Un verrou consultatif ne tombe QU'À la fin de la session. `release()` rend la
    // connexion VIVANTE au pool (idleTimeoutMillis) : après un unlock raté, le verrou
    // resterait détenu et toutes les exécutions suivantes répondraient `skipped`, sans
    // alerte. `release(error)` détruit le client dans node-postgres : la session se
    // termine réellement, et le verrou avec elle.
    if (borrowed) (client as PoolClient).release(unlockError ?? undefined);
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

  // Mêmes garde-fous que `processDeferredEffects`, et pour la même raison : échouer
  // bruyamment sur une option incohérente plutôt que de rendre un no-op indiscernable
  // d'une DLQ vide.
  requireConnection(connection);
  requireNonEmptyString("jobId", jobId);
  requireNonEmptyString("queue", queue);
  requireNonEmptyString("deadLetterQueue", deadLetterQueue);
  requireDistinctQueues(queue, deadLetterQueue);
  requireInteger("batchSize", batchSize, 1);
  requireInteger("visibilityTimeoutSeconds", visibilityTimeoutSeconds, 0);

  const borrowed = !isPoolClient(connection);
  const client = borrowed ? await (connection as Pool).connect() : (connection as PoolClient);

  const result: ReplayDeadLetteredEffectsResult = {
    jobId,
    skipped: false,
    reason: null,
    read: 0,
    replayed: 0,
    discarded: 0,
    archived: 0,
    failed: 0,
    hasMore: false,
    messageIds: [],
  };

  /**
   * Une entrée DLQ illisible ne doit JAMAIS rester en tête de file : `pgmq.read` sert les
   * messages visibles les plus anciens d'abord, donc `batchSize` entrées irrécupérables
   * suffisaient à masquer indéfiniment tous les messages récupérables situés derrière
   * elles — la reprise devenait structurellement impossible.
   *
   * On archive (`pgmq.archive`) : l'entrée quitte la file mais reste intégralement lisible
   * dans `pgmq.a_<queue>` pour l'analyse humaine. Rien n'est détruit.
   * Si l'archivage échoue (table d'archive absente, droits), on repousse sa visibilité
   * d'une heure : dégradé, mais la file redevient traversable.
   */
  const quarantine = async (msgId: string): Promise<void> => {
    try {
      await client.query(SQL.archiveMessage, [deadLetterQueue, msgId]);
      result.archived += 1;
      return;
    } catch (error) {
      logger.error("Archivage DLQ impossible : repli sur une mise à l'écart par timeout de visibilité.", {
        jobId,
        msgId,
        deadLetterQueue,
        worker: WORKER_NAME,
        operation: "quarantine.archive",
        ...describeError(error),
      });
    }
    try {
      await client.query(SQL.setVisibilityTimeout, [deadLetterQueue, msgId, QUARANTINE_VISIBILITY_SECONDS]);
    } catch (error) {
      logger.error("Mise à l'écart DLQ impossible : l'entrée illisible peut continuer de bloquer la tête de file.", {
        jobId,
        msgId,
        deadLetterQueue,
        worker: WORKER_NAME,
        operation: "quarantine.setVisibilityTimeout",
        ...describeError(error),
      });
    }
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
        // Irrécupérable : archivée pour analyse humaine, mais retirée de la tête de file.
        result.discarded += 1;
        await quarantine(row.msg_id);
        continue;
      }

      /**
       * L'échec d'UNE republication (queue absente, enveloppe refusée par
       * `deferred.publish_effect`, connexion perdue) ne doit pas détruire la progression
       * du lot : hors de ce `try`, l'erreur remontait au-delà de la boucle et l'appelant
       * perdait `replayed`, `messageIds` et `discarded` — y compris pour les messages
       * déjà republiés et commités. Ici l'échec est compté, journalisé, et l'entrée
       * — restée en DLQ — redeviendra visible à l'expiration de son VT.
       */
      try {
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
      } catch (error) {
        result.failed += 1;
        logger.error("Rejeu DLQ impossible : l'entrée reste en DLQ et redeviendra visible.", {
          jobId,
          msgId: row.msg_id,
          messageId: envelope.messageId,
          queue,
          deadLetterQueue,
          worker: WORKER_NAME,
          operation: "replayDeadLetteredEffects",
          ...describeError(error),
        });
        continue;
      }

      result.replayed += 1;
      result.messageIds.push(envelope.messageId);
    }

    result.hasMore = batch.rows.length >= batchSize;

    return result;
  } finally {
    const unlockError = locked ? await releaseAdvisoryLock(client, jobId) : null;
    // Même raison que dans `processDeferredEffects` : un client rendu au pool garde son
    // verrou, on le détruit donc quand l'unlock a échoué.
    if (borrowed) (client as PoolClient).release(unlockError ?? undefined);
  }
}
