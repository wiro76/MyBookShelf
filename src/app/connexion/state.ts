import type { AuthField } from "@/modules/identity/application/messages";

/**
 * État de l'écran de connexion — story 1.6 (AC 3).
 *
 * Dans son propre fichier parce qu'un module `"use server"` ne peut exporter que des
 * fonctions asynchrones : la Server Action et le composant client partagent ce type sans
 * qu'aucun des deux n'importe l'autre.
 *
 * Les trois familles d'erreur sont des champs SÉPARÉS, et c'est intentionnel :
 *   - `fieldErrors` — validation locale, une entrée par champ. C'est le seul champ qui décide
 *     de la règle de focus « une erreur → le champ, deux ou plus → le résumé ».
 *   - `credentialsRefused` — le refus du service. Il compte pour UNE erreur : il ne remplit
 *     pas `fieldErrors`, donc il n'ouvre jamais le résumé, et il marque les deux champs.
 *   - `serviceUnavailable` — la panne. Alerte distincte qui coexiste avec les autres au lieu
 *     de les remplacer ; c'est la raison d'être de la séparation.
 *
 * `attempt` s'incrémente à chaque soumission. Sans lui, deux échecs identiques produiraient
 * deux états structurellement égaux et le focus ne serait pas redéplacé à la seconde
 * tentative — l'utilisateur resterait sur le bouton sans rien entendre.
 */
export type ConnexionState = {
  attempt: number;
  fieldErrors: Partial<Record<AuthField, string>>;
  credentialsRefused: boolean;
  serviceUnavailable: boolean;
};

export const CONNEXION_INITIAL_STATE: ConnexionState = {
  attempt: 0,
  fieldErrors: {},
  credentialsRefused: false,
  serviceUnavailable: false,
};
