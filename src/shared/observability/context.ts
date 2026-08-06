import { AsyncLocalStorage } from "node:async_hooks";
import { redactSensitiveText } from "./redaction";

/**
 * Contexte de corrélation — story 1.4 (AC 1, AD-12).
 *
 * Tous les identifiants sont OPTIONNELS : « propagés selon le contexte ». Un worker n'a
 * pas de `requestId`, une requête anonyme n'a pas d'`actorId`, un Route Handler n'a pas
 * toujours de `jobId`. Un champ absent n'est jamais inventé ni remplacé par une chaîne
 * vide : il est simplement absent des attributs.
 *
 * Portée : `AsyncLocalStorage` **dans un Route Handler ou un worker**, jamais à travers
 * la frontière middleware → handler, dont l'isolation n'est pas confirmée sur Next 16.
 *
 * Rien n'est construit à l'import : le `AsyncLocalStorage` est instancié paresseusement,
 * au premier usage, comme le Pool de `src/shared/kernel/pool.ts`.
 */

export type CorrelationContext = {
  requestId?: string;
  commandId?: string;
  actorId?: string;
  jobId?: string;
};

/**
 * Les seules clés reconnues. Toute autre clé d'un objet passé en contexte est écartée :
 * le contexte n'est pas un sac fourre-tout, c'est le point de convergence de l'AC 2 et
 * il alimente directement les journaux.
 */
export const CORRELATION_KEYS = ["requestId", "commandId", "actorId", "jobId"] as const;

/**
 * Un identifiant de corrélation est un UUID (36 caractères) ou un pseudonyme HMAC hex
 * (64 caractères). 128 laisse de la marge sans jamais permettre d'y loger un contenu :
 * « ne stocker que des valeurs courtes et sérialisables ».
 */
export const CORRELATION_VALUE_MAX_LENGTH = 128;

const ACTOR_PSEUDONYM_PATTERN = /^[0-9a-f]{64}$/;

let storage: AsyncLocalStorage<CorrelationContext> | undefined;

function getStorage(): AsyncLocalStorage<CorrelationContext> {
  if (!storage) storage = new AsyncLocalStorage<CorrelationContext>();
  return storage;
}

/**
 * Ne retient que les clés connues portant une chaîne non vide, bornée en longueur.
 * Un nombre, un objet, un tableau ou `undefined` sont écartés — pas convertis.
 */
export function sanitizeCorrelationContext(context: CorrelationContext | undefined): CorrelationContext {
  const clean: CorrelationContext = {};
  if (!context) return clean;
  for (const key of CORRELATION_KEYS) {
    const value = context[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    if (key === "actorId") {
      if (ACTOR_PSEUDONYM_PATTERN.test(trimmed)) clean[key] = trimmed;
      continue;
    }
    clean[key] = redactSensitiveText(trimmed).slice(0, CORRELATION_VALUE_MAX_LENGTH);
  }
  return clean;
}

/**
 * Ouvre un contexte neuf pour la durée de `fn`. Ce qui existait avant est REMPLACÉ,
 * pas fusionné : c'est l'entrée d'une requête ou d'une tâche, pas un enrichissement.
 */
export function runWithCorrelation<T>(context: CorrelationContext, fn: () => T): T {
  return getStorage().run(sanitizeCorrelationContext(context), fn);
}

/**
 * Enrichit le contexte courant sans perdre l'existant. Une clé absente du patch —
 * ou portant une valeur non exploitable — laisse la valeur héritée intacte.
 */
export function withCorrelation<T>(patch: CorrelationContext, fn: () => T): T {
  const merged: CorrelationContext = { ...currentCorrelation(), ...sanitizeCorrelationContext(patch) };
  return getStorage().run(merged, fn);
}

/** Copie défensive : le contexte stocké n'est jamais mutable par un appelant. */
export function currentCorrelation(): CorrelationContext {
  return { ...(getStorage().getStore() ?? {}) };
}

/**
 * POINT DE CONVERGENCE de l'AC 2 : fonction pure, sans effet de bord, consommée à
 * l'identique par le logger, le scope Sentry et les attributs de span. Elle ne contient
 * QUE les clés réellement présentes — jamais de clé à `undefined`, qui deviendrait un
 * `"undefined"` dans un attribut de span ou un tag Sentry.
 */
export function correlationAttributes(): Record<string, string> {
  const current = currentCorrelation();
  const attributes: Record<string, string> = {};
  for (const key of CORRELATION_KEYS) {
    const value = current[key];
    if (typeof value === "string" && value.length > 0) attributes[key] = value;
  }
  return attributes;
}
