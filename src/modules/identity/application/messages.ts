/**
 * Libellés de la surface de connexion — story 1.6 (AC 3).
 *
 * Aucun libellé n'était prescrit. Registre imposé par `EXPERIENCE.md` : **tutoiement**,
 * chaleureux, phrases courtes, conséquence concrète, enthousiasme retenu. À éviter :
 * « Erreur » sec, points d'exclamation multiples, une coche sans texte.
 *
 * Ils vivent ici, hors de tout composant, pour trois raisons :
 *   - le serveur (validation, refus d'identifiants) et le client (résumé d'erreurs) doivent
 *     dire exactement la même chose, au caractère près, sans quoi le résumé et le message
 *     adjacent au champ se contrediraient à l'oreille d'un lecteur d'écran ;
 *   - le module est constitué de constantes pures : aucun import serveur, donc importable
 *     depuis un composant client sans traîner `next/headers` dans le paquet du navigateur ;
 *   - relire la voix du produit en un seul endroit est la seule façon de la tenir.
 *
 * ⚠️ `CREDENTIALS_REFUSED` est un **message unique**, identique que le compte existe ou non.
 * Distinguer « compte inconnu » de « mot de passe incorrect » offrirait un oracle
 * d'énumération de comptes : un attaquant apprendrait, adresse par adresse, lesquelles sont
 * inscrites. Il ne nomme donc aucune des deux valeurs et propose la même correction pour les
 * deux — vérifier l'une ET l'autre.
 */

/**
 * Champs du formulaire, dans l'ordre du DOM — c'est l'ordre du résumé d'erreurs.
 *
 * Ils vivent dans ce module de constantes, et non dans le cas d'usage, parce que le composant
 * client en a besoin : `sign-in.ts` importe `session.ts`, donc `next/headers`, qui n'existe
 * pas dans le paquet du navigateur. Une seule ligne d'import mal placée suffirait à casser le
 * build — et le message d'erreur ne désignerait pas la cause.
 */
export const AUTH_FIELDS = ["email", "password"] as const;
export type AuthField = (typeof AUTH_FIELDS)[number];

export const AUTH_LABELS = {
  eyebrow: "My BookShelf",
  title: "Retrouve ta bibliothèque",
  intro: "Connecte-toi pour ouvrir tes étagères. Toi seul y as accès.",
  emailLabel: "Ton adresse e-mail",
  emailHint: "Celle que tu utilises pour ta bibliothèque.",
  passwordLabel: "Ton mot de passe",
  passwordHint: "Il reste entre toi et cet écran.",
  submit: "Se connecter",
  submitPending: "Connexion en cours…",
  pendingStatus: "Connexion en cours…",
} as const;

export const AUTH_ERRORS = {
  /** Champ e-mail vide. Nomme ce qui manque, pas ce qui est « invalide ». */
  emailMissing: "Il manque ton adresse e-mail.",
  /** Format d'e-mail. Donne la correction concrète, pas la règle. */
  emailMalformed: "Cette adresse n’a pas la forme attendue. Vérifie qu’elle contient un @ et un domaine.",
  /** Champ mot de passe vide. */
  passwordMissing: "Il manque ton mot de passe.",
  /**
   * Refus d'identifiants — message UNIQUE, voir l'en-tête du fichier. Compte pour UNE
   * erreur : les deux champs sont marqués, le message est relié aux deux, le focus va sur
   * l'e-mail.
   */
  credentialsRefused: "Cette adresse et ce mot de passe ne vont pas ensemble. Vérifie les deux, puis réessaie.",
  /**
   * Panne réseau ou service d'authentification injoignable. Alerte distincte : elle ne dit
   * rien des identifiants, et rassure sur ce qui a été conservé.
   */
  serviceUnavailable: "La connexion au serveur n’a pas abouti. Tes saisies sont conservées. Réessaie dans un instant.",
} as const;

/** Titre du résumé d'erreurs, affiché à partir de deux erreurs de validation. */
export function errorSummaryTitle(count: number): string {
  return count > 1 ? `Il reste ${count} points à corriger.` : "Il reste un point à corriger.";
}
