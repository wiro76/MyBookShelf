import { createHmac } from "node:crypto";
import { requireObservabilityEnvironment } from "@/shared/config/environment";

/**
 * Pseudonymisation — story 1.4 (AC 1, AC 3 ; NFR-7, NFR-8).
 *
 * HMAC-SHA256 à clé secrète, jamais un hachage nu. La CNIL recommande le hachage à sel
 * secret ou une fonction à clé : reconstruire l'entrée exige alors la CLÉ, et pas
 * seulement la connaissance du sel. Sur un espace d'un seul utilisateur, un SHA-256 sans
 * clé se retrouve en une seconde par force brute sur l'adresse courriel.
 *
 * Rien n'est lu ni construit à l'import : la clé n'est cherchée qu'au moment de
 * pseudonymiser (voir `src/shared/kernel/pool.ts`, même exigence).
 */

/** Sortie hexadécimale : 64 caractères, stables, sans caractère à échapper en JSON. */
export function pseudonymize(value: string, key: string): string {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Clé de pseudonymisation absente");
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Valeur à pseudonymiser absente");
  }
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

/**
 * Pseudonymise un identifiant d'acteur avec la clé d'environnement.
 *
 * **LÈVE si `OBSERVABILITY_PSEUDONYM_KEY` est absente ou trop faible.** Aucun repli.
 * L'enseignement n° 1 de la story 1.3 était « une garde qui ne garde rien » : ici,
 * l'équivalent serait un `catch` retombant sur `createHash("sha256")`. Il n'existe pas.
 *
 * Le second paramètre n'existe que pour les tests et les appels qui portent déjà leur
 * propre environnement ; les appelants normaux passent le seul `actorId`.
 */
export function pseudonymizeActor(actorId: string, source: NodeJS.ProcessEnv = process.env): string {
  const { pseudonymKey } = requireObservabilityEnvironment(source);
  return pseudonymize(actorId, pseudonymKey);
}
