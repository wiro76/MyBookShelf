"use server";

import { redirect } from "next/navigation";
import { resolveRedirectDestination } from "@/modules/identity/application/redirect-allowlist";
import { signInWithPassword } from "@/modules/identity/application/sign-in";
import type { ConnexionState } from "./state";

/**
 * Server Action de connexion — story 1.6 (AC 1, AC 2, AC 3).
 *
 * Adaptateur, et rien d'autre (AD-2) : elle lit le `FormData`, délègue au cas d'usage, et
 * traduit le résultat en état d'écran. Aucune règle ici.
 *
 * Le navigateur n'appelle JAMAIS Supabase directement : la soumission part vers le serveur
 * Next, qui identifie et pose le cookie httpOnly. C'est ce que dit AD-10 — « Next.js reste
 * l'unique façade des données privées ».
 *
 * ⚠️ La destination est REVALIDÉE ici, même si elle l'a déjà été au rendu de la page. Le champ
 * caché qui la transporte est envoyé par le client : sa valeur au moment de la soumission n'a
 * aucun rapport garanti avec celle que le serveur avait rendue. Valider une seule fois, à
 * l'affichage, laisserait la redirection ouverte à quiconque poste directement le formulaire.
 *
 * ⚠️ Le mot de passe ne repart JAMAIS vers le client. L'état rendu ne porte que des drapeaux
 * et des libellés constants ; la conservation de la saisie est assurée côté navigateur par des
 * champs contrôlés (voir `connexion-form.tsx`), pas par un aller-retour de la valeur.
 */
export async function connexionAction(previousState: ConnexionState, formData: FormData): Promise<ConnexionState> {
  const destination = resolveRedirectDestination(formData.get("destination"));
  const attempt = previousState.attempt + 1;

  const outcome = await signInWithPassword({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (outcome.status === "invalid") {
    return { attempt, fieldErrors: outcome.fieldErrors, credentialsRefused: false, serviceUnavailable: false };
  }
  if (outcome.status === "refused") {
    // UNE erreur : les deux champs seront marqués, le message relié aux deux, le focus ira
    // sur l'e-mail. Aucune erreur de champ n'est fabriquée pour autant — le résumé « deux
    // erreurs ou plus » ne doit pas s'ouvrir sur ce cas.
    return { attempt, fieldErrors: {}, credentialsRefused: true, serviceUnavailable: false };
  }
  if (outcome.status === "unavailable") {
    // Alerte globale DISTINCTE : `serviceUnavailable` est un drapeau à part, qui n'écrit rien
    // dans `fieldErrors` et n'en retire rien. Si la soumission courante portait des erreurs de
    // champ, elles seraient rendues À CÔTÉ de l'alerte, pas remplacées par elle — c'est ce que
    // signifie « l'alerte réseau n'efface pas les erreurs de validation ».
    //
    // Elles sont pour autant celles de la soumission COURANTE, jamais recopiées de la
    // précédente : ce chemin n'est atteint qu'après une validation réussie, et rejouer les
    // erreurs de la tentative d'avant afficherait « Il manque ton mot de passe » sous un champ
    // que l'utilisateur vient précisément de remplir, puis renverrait le focus dessus.
    return { attempt, fieldErrors: {}, credentialsRefused: false, serviceUnavailable: true };
  }

  // `redirect` lève une exception de contrôle interceptée par Next : elle doit rester HORS de
  // tout `try`, et rien ne peut la suivre.
  redirect(destination);
}
