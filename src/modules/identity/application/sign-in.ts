import { describeError, logger, pseudonymizeActor } from "@/shared/observability";
import { AUTH_ERRORS, type AuthField } from "./messages";
import { createServerSupabaseClient } from "./session";

/**
 * Cas d'usage de connexion par e-mail et mot de passe — story 1.6 (AC 2, AC 3).
 *
 * Il valide la saisie, délègue l'identification à Supabase Auth, et rend un résultat
 * STRUCTURÉ que l'adaptateur HTTP (la Server Action) traduit en état d'écran. Aucune
 * exception ne traverse cette frontière : un formulaire qui rend une page 500 perdrait la
 * saisie, ce que l'AC 3 interdit explicitement.
 *
 * Il ne touche à aucune table métier. La session posée ici sert ensuite, et seulement
 * ensuite, à `authenticatedTransaction`.
 */

export type SignInOutcome =
  /** Identité vérifiée, session établie. */
  | { status: "success" }
  /** Validation locale : au moins un champ est en défaut. */
  | { status: "invalid"; fieldErrors: Partial<Record<AuthField, string>> }
  /** Le service a refusé le couple. UNE erreur, sans distinction de cause. */
  | { status: "refused" }
  /** Le service n'a pas répondu, ou a répondu une panne. Ce n'est pas un refus. */
  | { status: "unavailable" };

/**
 * Plafond appliqué AVANT toute validation. RFC 5321 plafonne une adresse à 320 caractères ;
 * au-delà, la valeur n'est pas une adresse, c'est une charge. Rien de plus long n'est ni
 * testé, ni copié, ni transmis au service.
 */
const EMAIL_MAX_LENGTH = 320;

/**
 * Plafond du mot de passe. bcrypt, utilisé par GoTrue, ignore au-delà de 72 octets ; 1024
 * laisse toute latitude à une phrase de passe tout en bornant ce qui traverse le réseau.
 */
const PASSWORD_MAX_LENGTH = 1024;

/**
 * ⚠️ TOUS LES QUANTIFICATEURS SONT BORNÉS, sans exception — enseignement n° 6 de la story
 * 1.3 : un quantificateur non borné sur du texte utilisateur a coûté 72 secondes sur une
 * seule valeur, et cette expression s'applique littéralement à ce que quelqu'un tape.
 *
 * Elle est de surcroît NON AMBIGUË, ce qui compte autant que les bornes : la partie locale
 * exclut `@`, et chaque étiquette de domaine exclut `.`. Aucune position de la chaîne ne peut
 * donc être consommée par deux quantificateurs différents — le moteur n'a rien à explorer en
 * retour arrière, et le coût reste linéaire même sur une entrée forgée. Des bornes posées sur
 * des classes qui se chevauchent (`[^\s]{1,64}@[^\s]{1,255}`) auraient gardé le problème.
 *
 * Elle reste volontairement PERMISSIVE : elle refuse ce qui ne peut manifestement pas être
 * une adresse, pas ce qui n'est pas déposé chez un registrar. Le seul juge de l'existence
 * d'un compte est le service d'authentification, et son verdict est le message unique.
 */
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,8}$/;

const OPERATION = "identity/sign-in";

/**
 * Pseudonymise pour les journaux, ou rend `undefined`.
 *
 * `pseudonymizeActor` LÈVE si `OBSERVABILITY_PSEUDONYM_KEY` est absente ou trop faible, et
 * c'est très bien : la story 1.4 refuse tout repli sur un hachage nu, qui serait réversible
 * en une seconde sur une bibliothèque à un seul utilisateur. Mais ce chemin-ci est de
 * l'OBSERVABILITÉ, pas une garde : faire échouer une connexion parce qu'une clé de journal
 * manque transformerait un défaut de configuration d'observabilité en panne d'authentification.
 *
 * On journalise donc sans `actorId`. Ce n'est pas un repli dégradé : c'est l'absence de la
 * donnée, ce qui est strictement plus sûr que sa présence. Ce qui n'arrive JAMAIS, dans aucune
 * branche, c'est que l'e-mail saisi entre dans un journal — la liste blanche du logger le
 * détruirait de toute façon, et on ne cherche pas à la contourner.
 */
function pseudonymOrNothing(value: string): string | undefined {
  try {
    return pseudonymizeActor(value);
  } catch {
    return undefined;
  }
}

/**
 * Vrai si le service a répondu « ces identifiants ne conviennent pas », faux s'il n'a pas
 * répondu du tout.
 *
 * La distinction se lit sur le `status` HTTP porté par l'erreur d'authentification, par
 * typage structurel plutôt que par `instanceof` : les classes d'erreur de `@supabase/auth-js`
 * sont réexportées par `@supabase/supabase-js`, mais une comparaison d'identité de classe
 * casse silencieusement si deux copies du paquet coexistent dans l'arbre de dépendances — et
 * elle casserait du bon côté de l'échec le plus discret : tout deviendrait « indisponible »,
 * y compris un vrai refus.
 *
 * `429` (trop de tentatives) est délibérément classé indisponible et non refusé : c'est une
 * limitation de débit, pas un verdict sur le couple saisi, et l'annoncer comme un refus
 * inviterait à retaper des identifiants pourtant corrects.
 */
function isCredentialRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  if (typeof status !== "number") return false;
  return status >= 400 && status < 500 && status !== 429;
}

export type SignInInput = {
  email: unknown;
  password: unknown;
};

export async function signInWithPassword({ email, password }: SignInInput): Promise<SignInOutcome> {
  const emailValue = typeof email === "string" ? email : "";
  const passwordValue = typeof password === "string" ? password : "";

  // --- Validation locale ----------------------------------------------------
  // Elle est délibérément minimale et n'invente aucune règle de mot de passe : à la
  // CONNEXION, exiger « 12 caractères et un chiffre » refuserait localement un mot de passe
  // pourtant valide et renseignerait l'attaquant sur la politique du compte. Seul le vide
  // est refusé — il ne peut être correct.
  const fieldErrors: Partial<Record<AuthField, string>> = {};
  const trimmedEmail = emailValue.trim();
  if (trimmedEmail.length === 0) {
    fieldErrors.email = AUTH_ERRORS.emailMissing;
  } else if (trimmedEmail.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(trimmedEmail)) {
    fieldErrors.email = AUTH_ERRORS.emailMalformed;
  }
  if (passwordValue.length === 0) {
    fieldErrors.password = AUTH_ERRORS.passwordMissing;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "invalid", fieldErrors };
  }
  if (passwordValue.length > PASSWORD_MAX_LENGTH) {
    // Aucun mot de passe réel n'atteint cette longueur ; on ne le transmet pas au service et
    // on ne le distingue pas d'un refus — le dire serait renseigner sur la politique du compte.
    return { status: "refused" };
  }

  // --- Identification -------------------------------------------------------
  const actorId = pseudonymOrNothing(trimmedEmail);

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    logger.error("Connexion impossible : configuration d'authentification invalide", {
      operation: OPERATION,
      outcome: "unavailable",
      reason: "configuration_invalide",
      ...describeError(error),
    });
    return { status: "unavailable" };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: passwordValue,
    });

    if (error) {
      if (isCredentialRefusal(error)) {
        // `actorId` est un HMAC-SHA256 : il permet de corréler des tentatives répétées sans
        // qu'aucune adresse ne figure dans les journaux. `describeError` n'est PAS joint —
        // le message du fournisseur nomme la cause exacte (« Invalid login credentials » vs
        // « Email not confirmed »), et le journal deviendrait l'oracle d'énumération que la
        // réponse HTTP refuse d'être.
        logger.warn("Identifiants refusés", {
          operation: OPERATION,
          outcome: "refused",
          ...(actorId ? { actorId } : {}),
        });
        return { status: "refused" };
      }
      logger.error("Service d'authentification indisponible", {
        operation: OPERATION,
        outcome: "unavailable",
        ...(actorId ? { actorId } : {}),
        ...describeError(error),
      });
      return { status: "unavailable" };
    }

    if (!data?.user?.id) {
      // Aucune erreur mais aucun utilisateur : réponse incohérente, traitée comme une panne.
      logger.error("Réponse d'authentification sans utilisateur", {
        operation: OPERATION,
        outcome: "unavailable",
        reason: "reponse_incoherente",
      });
      return { status: "unavailable" };
    }

    // L'identifiant journalisé est celui rendu par le SERVEUR, pseudonymisé — pas celui saisi.
    const verifiedActorId = pseudonymOrNothing(data.user.id);
    logger.info("Session établie", {
      operation: OPERATION,
      outcome: "success",
      ...(verifiedActorId ? { actorId: verifiedActorId } : {}),
    });
    return { status: "success" };
  } catch (error) {
    logger.error("Échec inattendu de la connexion", {
      operation: OPERATION,
      outcome: "unavailable",
      ...(actorId ? { actorId } : {}),
      ...describeError(error),
    });
    return { status: "unavailable" };
  }
}
