import { correlationAttributes } from "./context";

/**
 * Logger structuré — story 1.4 (AC 2, AC 3 ; AD-12).
 *
 * Écrit à la main, aucune dépendance : ni pino, ni winston. Vercel parse déjà le JSON
 * écrit sur `console.*`. Une ligne JSON par événement, rien de construit à l'import,
 * aucune lecture d'environnement.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * DEUX GARDES, DANS CET ORDRE
 * ────────────────────────────────────────────────────────────────────────────────
 * 1. LISTE BLANCHE sur les CLÉS (garantie principale). Un champ absent de
 *    `ALLOWED_FIELDS` est DÉTRUIT — pas tronqué, pas masqué, pas remplacé par un
 *    marqueur : il n'apparaît nulle part dans la ligne produite. Une liste noire
 *    laisserait passer ce qu'on n'a pas anticipé ; c'est précisément ce qui manque
 *    aujourd'hui, où les 8 `console.error` du projet ne fuitent que par chance.
 *    Le type est vérifié en plus du nom : une clé autorisée portant un objet, un
 *    tableau ou une fonction est détruite elle aussi. C'est ce qui ferme le chemin
 *    indirect — `{ errorCode: { payload: … } }`, l'enveloppe complète glissée sous un
 *    nom acceptable.
 *
 * 2. EXPURGATION sur les VALEURS (filet de rattrapage, jamais la garantie). Le
 *    `message` et les champs de texte libre échappent par nature à toute liste
 *    blanche : `logger.error(\`échec pour \${email}\`)` compile. On y masque donc les
 *    motifs à haut risque — adresses courriel, URL (donc URL signées ET chaînes de
 *    connexion Postgres), jetons JWT et secrets opaques. C'est une liste noire, et
 *    elle est assumée comme telle : elle ne protège que ce qu'elle connaît. La règle
 *    reste que `message` doit être un LITTÉRAL STATIQUE ; tout le reste passe par des
 *    champs.
 *
 * Les identifiants de corrélation, eux, ne sont pas expurgés : ce sont des UUID et des
 * pseudonymes HMAC produits par nous — les expurger reviendrait à effacer la corrélation
 * que la story livre.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Plafond Vercel : **256 Ko par ligne** de journal (256 lignes et 1 Mo par requête).
 * Au-delà, la plateforme tronque elle-même, à l'octet — ce qui produit un JSON invalide,
 * donc une ligne illisible par l'agrégateur, donc un incident non diagnosticable.
 * On tronque avant elle, sur les VALEURS, en re-sérialisant : le JSON reste valide.
 */
export const LOG_LINE_MAX_BYTES = 256 * 1024;

/** Suffixe apposé à toute valeur raccourcie, pour qu'une lecture ne se trompe pas. */
export const TRUNCATION_SUFFIX = "…[tronqué]";

/** Marqueur substitué à un fragment reconnu comme sensible. */
export const REDACTION_PLACEHOLDER = "[expurgé]";

/**
 * LISTE BLANCHE. Chaque entrée déclare les types acceptés pour cette clé.
 *
 * Justification, famille par famille :
 *
 * - **Corrélation** (`requestId`, `commandId`, `actorId`, `jobId`) : la raison d'être de
 *   la story. `actorId` n'entre ici que pseudonymisé — voir `pseudonymizeActor`.
 * - **Erreur** (`errorCode`, `errorMessage`) : sortie exacte de `describeError`. Le code
 *   est un identifiant technique ; le message est du texte fournisseur, donc expurgé et
 *   tronqué. C'est le champ le plus exposé du lot, et le seul qu'on accepte par nécessité.
 * - **Identifiants de messagerie** (`msgId`, `messageId`) : entier pgmq et UUID
 *   d'enveloppe. Ni l'un ni l'autre n'est dérivé d'un contenu.
 * - **Topologie** (`queue`, `deadLetterQueue`, `worker`, `operation`, `producer`,
 *   `eventType`) : noms de files, de modules, de fonctions et de types d'événements. Ce
 *   sont des constantes du code source, pas des données d'exécution. `eventType` nomme un
 *   schéma (`library.book.added`), jamais son contenu.
 * - **Mesures** (`durationMs`, `count`, `attempt`, `readCt`, `batchSize`) : des nombres.
 *   Un nombre ne porte pas de titre de manga.
 * - **Issue** (`outcome`, `reason`, `skipped`, `stoppedForTime`) : le résultat d'une
 *   exécution. `outcome` et `reason` sont attendus comme des constantes courtes
 *   (`"retry_threshold_exceeded"`) ; ils sont expurgés au cas où un appelant y glisserait
 *   un texte d'origine.
 *
 * Ce qui est délibérément ABSENT et doit le rester : `payload`, `message` d'enveloppe,
 * `title`, `email`, `url`, `headers`, `body`, `stack`, `error` (l'objet brut), et tout
 * champ libre. Les ajouter reviendrait à défaire la story.
 */
const ALLOWED_FIELDS: Record<string, ReadonlyArray<"string" | "number" | "boolean">> = {
  requestId: ["string"],
  commandId: ["string"],
  actorId: ["string"],
  jobId: ["string"],
  errorCode: ["string"],
  errorMessage: ["string"],
  msgId: ["string", "number"],
  messageId: ["string"],
  queue: ["string"],
  deadLetterQueue: ["string"],
  worker: ["string"],
  operation: ["string"],
  producer: ["string"],
  eventType: ["string"],
  durationMs: ["number"],
  count: ["number"],
  attempt: ["number"],
  readCt: ["number"],
  batchSize: ["number"],
  outcome: ["string"],
  reason: ["string"],
  skipped: ["boolean"],
  stoppedForTime: ["boolean"],
};

/** Les seules clés dont la valeur échappe à l'expurgation : nous les produisons. */
const CORRELATION_FIELDS = new Set(["requestId", "commandId", "actorId", "jobId"]);

/**
 * Motifs à haut risque, du plus spécifique au plus général. Ils s'appliquent au texte
 * libre uniquement (voir l'en-tête : filet, pas garantie).
 */
/**
 * Tous les quantificateurs sont BORNÉS, sans exception.
 *
 * Une borne supérieure n'est pas une coquetterie : avec `+` ou `{40,}` sur une classe
 * large, une chaîne longue et sans séparateur — un `errorMessage` volumineux renvoyé par
 * un fournisseur, par exemple — fait repartir le moteur d'expressions régulières depuis
 * chaque position. Mesuré avant correction : 72 secondes pour une seule valeur de 300 000
 * caractères, sur le chemin de journalisation, c'est-à-dire précisément là où l'on essaie
 * de comprendre un incident. Les bornes ci-dessous couvrent toutes les valeurs réelles
 * (RFC 5321 plafonne une partie locale à 64 caractères et un domaine à 255).
 */
const REDACTION_PATTERNS: ReadonlyArray<RegExp> = [
  // Adresse courriel.
  /[\w!#$%&'*+/=?^`{|}~.-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g,
  // Toute URI à schéma : https signée, postgres://user:pass@host, supabase://…
  /\b[a-z][a-z0-9+.-]{0,31}:\/\/\S{1,2048}/gi,
  // Jeton JWT.
  /\beyJ[A-Za-z0-9_-]{4,2048}\.[A-Za-z0-9_-]{4,2048}\.[A-Za-z0-9_-]{0,2048}/g,
  // Secret opaque : 40 caractères ou plus sans séparateur. Un UUID (36) n'y tombe pas,
  // un pseudonyme HMAC n'est jamais soumis à cette passe (voir CORRELATION_FIELDS).
  /\b[A-Za-z0-9_-]{40,4096}\b/g,
];

/**
 * Plafond appliqué AVANT l'expurgation, en défense en profondeur : au-delà, aucune valeur
 * n'apporte de diagnostic, et la borner ici garantit un coût de journalisation prévisible
 * même si un motif futur était réintroduit sans borne.
 */
const REDACTION_INPUT_MAX_LENGTH = 8192;

function redact(value: string): string {
  let redacted =
    value.length > REDACTION_INPUT_MAX_LENGTH
      ? `${value.slice(0, REDACTION_INPUT_MAX_LENGTH)}${TRUNCATION_SUFFIX}`
      : value;
  for (const pattern of REDACTION_PATTERNS) redacted = redacted.replace(pattern, REDACTION_PLACEHOLDER);
  return redacted;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/**
 * Applique la liste blanche. Retourne un objet dont chaque valeur est un scalaire
 * sérialisable. Ne lève jamais : un chemin de journalisation qui casse le traitement
 * qu'il observe est pire que l'absence de journal.
 */
function applyWhitelist(fields: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const retained: Record<string, string | number | boolean> = {};
  if (!fields || typeof fields !== "object") return retained;
  let entries: [string, unknown][] = [];
  try {
    entries = Object.entries(fields);
  } catch {
    return retained;
  }
  for (const [key, value] of entries) {
    const allowedTypes = Object.prototype.hasOwnProperty.call(ALLOWED_FIELDS, key) ? ALLOWED_FIELDS[key] : undefined;
    if (!allowedTypes) continue; // champ inconnu : DÉTRUIT.
    if (typeof value === "string" && allowedTypes.includes("string")) {
      if (value.length === 0) continue;
      retained[key] = CORRELATION_FIELDS.has(key) ? value : redact(value);
      continue;
    }
    if (typeof value === "number" && allowedTypes.includes("number") && Number.isFinite(value)) {
      retained[key] = value;
      continue;
    }
    if (typeof value === "boolean" && allowedTypes.includes("boolean")) {
      retained[key] = value;
    }
    // Tout le reste — objet, tableau, fonction, symbole, null, undefined, type
    // inattendu sous une clé autorisée — est DÉTRUIT sans trace.
  }
  return retained;
}

function safeJson(record: Record<string, unknown>): string {
  try {
    return JSON.stringify(record);
  } catch {
    return JSON.stringify({ level: "error", message: "[journal non sérialisable]", timestamp: new Date().toISOString() });
  }
}

/** Raccourcit les valeurs textuelles, de la plus longue à la plus courte, jusqu'à tenir. */
function serializeWithinLimit(record: Record<string, string | number | boolean>): string {
  let line = safeJson(record);
  let garde = 0;
  while (byteLength(line) > LOG_LINE_MAX_BYTES && garde < 64) {
    garde += 1;
    let cible: string | undefined;
    let longueur = 0;
    for (const [key, value] of Object.entries(record)) {
      if (key === "level" || key === "timestamp") continue;
      if (typeof value === "string" && value.length > longueur) {
        cible = key;
        longueur = value.length;
      }
    }
    if (!cible || longueur === 0) break;
    const valeur = record[cible] as string;
    const conserve = valeur.slice(0, Math.floor(valeur.length / 2));
    const remplacement = `${conserve}${TRUNCATION_SUFFIX}`;
    if (remplacement.length >= valeur.length) break;
    record[cible] = remplacement;
    line = safeJson(record);
  }
  if (byteLength(line) > LOG_LINE_MAX_BYTES) {
    // Dernier recours : on préfère une ligne pauvre et valide à une ligne coupée par la
    // plateforme au milieu d'une chaîne.
    return safeJson({
      level: record.level,
      message: "[journal tronqué]",
      timestamp: record.timestamp,
      ...correlationAttributes(),
    });
  }
  return line;
}

/**
 * Construit la ligne JSON sans l'écrire. Exportée pour que les tests — dont le test de
 * fuite — puissent l'inspecter sans capturer `console`.
 *
 * Ordre des clés : `level`, `message`, `timestamp`, puis les attributs de corrélation
 * fusionnés automatiquement depuis `correlationAttributes()`, puis les champs retenus.
 * La corrélation est posée AVANT les champs explicites, donc un appelant peut surcharger
 * un identifiant (un worker qui journalise le `jobId` d'un autre message), mais il ne
 * peut pas en faire disparaître un.
 */
export function formatLogLine(level: LogLevel, message: string, fields?: Record<string, unknown>): string {
  const record: Record<string, string | number | boolean> = {
    level,
    message: redact(typeof message === "string" ? message : ""),
    timestamp: new Date().toISOString(),
    ...correlationAttributes(),
    ...applyWhitelist(fields),
  };
  return serializeWithinLimit(record);
}

const SINKS: Record<LogLevel, (line: string) => void> = {
  debug: (line) => console.debug(line),
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  SINKS[level](formatLogLine(level, message, fields));
}

export const logger = {
  debug(message: string, fields?: Record<string, unknown>): void {
    write("debug", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: Record<string, unknown>): void {
    write("error", message, fields);
  },
};
