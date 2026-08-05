/**
 * Description et stabilisation des erreurs — story 1.4 (AC 3, AC 4).
 *
 * Deux fonctions, deux frontières distinctes, à ne jamais confondre :
 *
 *   describeError()  → CÔTÉ SERVEUR. Texte et code d'origine, pour le journal.
 *   toStableError()  → FRONTIÈRE HTTP. Code et message stables, écrits par nous.
 *
 * Le texte du fournisseur (Postgres, Supabase, Sentry, un SDK quelconque) ne franchit
 * jamais la seconde : un message d'erreur `pg` porte régulièrement un fragment de
 * requête, un nom de contrainte, voire une chaîne de connexion.
 *
 * Aucun import, aucune lecture d'environnement, rien de construit au chargement.
 */

/**
 * Borne héritée du worker (story 1.3). Un message d'erreur au-delà de 2000 caractères est
 * une stack ou un dump, pas une information.
 */
export const ERROR_MESSAGE_MAX_LENGTH = 2000;

/** Code rendu quand rien de fiable n'a pu être établi. */
export const UNEXPECTED_ERROR_CODE = "UNEXPECTED_ERROR";

/** Code stable par défaut à la frontière HTTP. Minuscules : il part en JSON de réponse. */
export const DEFAULT_STABLE_ERROR_CODE = "erreur_inattendue";

/**
 * Messages stables, écrits ici, en français, jamais dérivés d'une erreur d'origine.
 * Un code inconnu reçoit le message par défaut plutôt qu'un texte fournisseur.
 */
const STABLE_ERROR_MESSAGES: Record<string, string> = {
  erreur_inattendue: "Une erreur inattendue est survenue.",
  configuration_invalide: "La configuration du service est invalide.",
  execution_echouee: "Le traitement n'a pas pu aboutir.",
  requete_invalide: "La requête est invalide.",
  acces_refuse: "Accès refusé.",
  conflit: "La ressource a été modifiée entre-temps.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Lecture d'une propriété dont l'accesseur peut lever (Proxy, getter piégé). */
function safeProperty(value: Record<string, unknown>, key: string): unknown {
  try {
    return value[key];
  } catch {
    return undefined;
  }
}

/**
 * `String(value)` n'est PAS total : un objet sans prototype (`Object.create(null)`), un
 * objet dont `Symbol.toPrimitive` lève, ou un Proxy piégé font lever la conversion.
 * Trois filets successifs, du plus informatif au plus pauvre, et jamais de propagation.
 */
function safeStringify(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "symbol") return `Symbol(${value.description ?? ""})`;
    return String(value);
  } catch {
    try {
      return Object.prototype.toString.call(value);
    } catch {
      return "[erreur indescriptible]";
    }
  }
}

/**
 * Décrit une erreur SANS JAMAIS lever. Les appelants l'invoquent hors de tout `try` :
 * une exception ici tuerait l'exécution entière au lieu de journaliser un simple échec —
 * l'inverse exact de ce que doit faire un chemin de journalisation.
 *
 * Destinée au SERVEUR uniquement. Sa sortie passe par le logger, qui expurge les motifs
 * sensibles avant écriture ; elle ne doit jamais être renvoyée telle quelle en HTTP.
 */
export function describeError(error: unknown): { errorCode: string; errorMessage: string } {
  try {
    if (isRecord(error)) {
      const rawCode = safeProperty(error, "code");
      const errorCode = typeof rawCode === "string" && rawCode.length > 0 ? rawCode : UNEXPECTED_ERROR_CODE;
      const rawMessage = safeProperty(error, "message");
      const message = typeof rawMessage === "string" ? rawMessage : safeStringify(error);
      return { errorCode, errorMessage: message.slice(0, ERROR_MESSAGE_MAX_LENGTH) };
    }
    return { errorCode: UNEXPECTED_ERROR_CODE, errorMessage: safeStringify(error).slice(0, ERROR_MESSAGE_MAX_LENGTH) };
  } catch {
    // Filet ultime : même `isRecord` peut être mis en défaut par un exotisme non prévu.
    return { errorCode: UNEXPECTED_ERROR_CODE, errorMessage: "[erreur indescriptible]" };
  }
}

/**
 * Forme d'erreur prescrite par l'architecture, seule autorisée à franchir la frontière
 * HTTP. `fieldErrors` et `conflict` n'auront de producteur qu'à partir des stories de
 * commandes : ils sont typés dès maintenant, mais aucun chemin ne les remplit ici.
 */
export type StableError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  conflict?: unknown;
};

/**
 * Propriété-marqueur qu'un producteur attache DÉLIBÉRÉMENT à son erreur pour déclarer
 * que son contenu est déjà stable et publiable.
 *
 * Pourquoi un marqueur explicite plutôt qu'une détection de forme : une erreur `pg` porte
 * elle aussi un `code` (`"23505"`) et un `message` — la reconnaître « à la forme »
 * laisserait passer l'identifiant et le texte du fournisseur, c'est-à-dire exactement ce
 * que l'AC 4 interdit. Le laissez-passer se demande, il ne se déduit pas.
 */
export const STABLE_ERROR_MARKER = "stableError";

function stableMessageFor(code: string): string {
  return STABLE_ERROR_MESSAGES[code] ?? STABLE_ERROR_MESSAGES[DEFAULT_STABLE_ERROR_CODE];
}

/** Ne retient que des paires `string → string` : aucun objet imbriqué ne passe. */
function sanitizeFieldErrors(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const fieldErrors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && raw.length > 0) fieldErrors[key] = raw.slice(0, ERROR_MESSAGE_MAX_LENGTH);
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

/**
 * Convertit une erreur quelconque en erreur stable. Ne lève jamais.
 *
 * Par défaut, RIEN de l'erreur d'origine n'est repris : ni son message, ni son code, ni
 * sa stack. Le code rendu est celui que l'appelant a choisi, le message est le nôtre.
 * Seule une erreur portant le marqueur `stableError` voit son contenu repris — et encore,
 * après filtrage.
 *
 * Le texte d'origine reste accessible au serveur via `describeError`, pour le journal.
 */
export function toStableError(error: unknown, code: string = DEFAULT_STABLE_ERROR_CODE): StableError {
  const requestedCode = typeof code === "string" && code.length > 0 ? code : DEFAULT_STABLE_ERROR_CODE;
  try {
    const declared = isRecord(error) ? safeProperty(error, STABLE_ERROR_MARKER) : undefined;
    if (isRecord(declared)) {
      const declaredCode = safeProperty(declared, "code");
      const declaredMessage = safeProperty(declared, "message");
      const stable: StableError = {
        code: typeof declaredCode === "string" && declaredCode.length > 0 ? declaredCode : requestedCode,
        message:
          typeof declaredMessage === "string" && declaredMessage.length > 0
            ? declaredMessage.slice(0, ERROR_MESSAGE_MAX_LENGTH)
            : stableMessageFor(requestedCode),
      };
      const fieldErrors = sanitizeFieldErrors(safeProperty(declared, "fieldErrors"));
      if (fieldErrors) stable.fieldErrors = fieldErrors;
      const conflict = safeProperty(declared, "conflict");
      if (conflict !== undefined) stable.conflict = conflict;
      return stable;
    }
  } catch {
    // Un accesseur piégé ne doit pas empêcher de rendre une erreur stable.
  }
  return { code: requestedCode, message: stableMessageFor(requestedCode) };
}
