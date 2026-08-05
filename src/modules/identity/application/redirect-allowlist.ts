/**
 * Validation de la destination de retour — story 1.6 (AC 1 ; AD-10).
 *
 * AD-10, verbatim : « retour d'authentification limité à un chemin relatif autorisé ».
 * La destination arrive de la barre d'adresse (`/connexion?destination=…`) puis d'un champ
 * caché du formulaire : elle est **entièrement contrôlée par le client**, deux fois, et sert
 * à décider où le navigateur ira APRÈS qu'une session valide a été posée. C'est exactement la
 * forme d'une redirection ouverte : un attaquant qui obtient `?destination=https://evil.test`
 * envoie une personne authentifiée sur son site, jeton de session fraîchement établi.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LISTE BLANCHE LITTÉRALE, ET RIEN D'AUTRE
 * ────────────────────────────────────────────────────────────────────────────────
 * Aucune analyse d'URL, aucune normalisation, aucune expression régulière, aucun décodage :
 * la valeur reçue est comparée telle quelle aux deux chaînes autorisées. Tout le reste est
 * refusé, sans exception et sans cas particulier.
 *
 * C'est délibérément la stratégie la plus bête possible, et c'est ce qui en fait la garantie :
 *
 * 1. **Rien à contourner.** `https://evil.test`, `//evil.test`, `\\evil.test`,
 *    `javascript:alert(1)`, `/bibliotheque/../admin`, `/bibliotheque%2F..%2Fadmin`,
 *    `/BIBLIOTHEQUE`, `/bibliotheque/` : aucune de ces chaînes n'est `"/"` ni `"/bibliotheque"`,
 *    donc toutes sont refusées par la même ligne de code. Une liste noire — « refuser ce qui
 *    commence par `//` » — n'aurait fermé que les formes anticipées ; l'enseignement n° 2 de la
 *    story 1.3 (« une garde qui ne garde rien ») porte précisément sur ce genre de garde
 *    partielle.
 * 2. **Aucune normalisation.** Décoder, trimmer ou résoudre `..` avant de comparer, c'est
 *    rouvrir l'écart entre la valeur validée et la valeur utilisée — la source classique des
 *    contournements. Ce qui est comparé est ce qui sera utilisé, octet pour octet.
 * 3. **Aucune expression régulière.** Enseignement n° 6 de la story 1.3 : un quantificateur
 *    non borné appliqué à du texte utilisateur a coûté 72 secondes sur une seule valeur. Ici
 *    il n'y a pas de moteur d'expressions régulières du tout — une comparaison d'égalité de
 *    chaînes est linéaire, et le plafond de longueur ci-dessous écarte même le coût de cette
 *    comparaison sur une valeur démesurée.
 *
 * En cas de refus, on retombe **silencieusement** sur `/`. La valeur refusée n'est ni
 * réaffichée, ni journalisée, ni renvoyée dans un message : la réafficher serait un vecteur
 * d'injection dans la page de connexion, et la journaliser ferait entrer une chaîne
 * arbitraire d'origine externe dans les journaux.
 */

/**
 * Les deux seules destinations acceptées. Littérales, en dur, jamais construites.
 * Ajouter une route privée ici est une décision de sécurité, pas une formalité.
 */
export const REDIRECT_ALLOWLIST = ["/", "/bibliotheque"] as const;

export type AllowedRedirect = (typeof REDIRECT_ALLOWLIST)[number];

/** Repli en cas de refus. La racine est publique : elle ne divulgue rien. */
export const DEFAULT_REDIRECT: AllowedRedirect = "/";

/** Route privée témoin de la story. Exportée pour que personne ne la retape à la main. */
export const PRIVATE_LIBRARY_REDIRECT: AllowedRedirect = "/bibliotheque";

/**
 * Plafond de longueur appliqué AVANT toute comparaison.
 *
 * La plus longue valeur autorisée fait 14 caractères ; 64 laisse une marge confortable tout
 * en garantissant qu'aucune chaîne de plusieurs mégaoctets — un `?destination=` gonflé
 * exprès — n'est jamais comparée, copiée ni retenue. Défense en profondeur : la comparaison
 * d'égalité serait déjà linéaire.
 */
const MAX_REDIRECT_LENGTH = 64;

/**
 * `true` si et seulement si la valeur est **exactement** l'une des destinations autorisées.
 *
 * Accepte `unknown` volontairement : les `searchParams` de Next rendent `string | string[] |
 * undefined`, et un `FormData` rend `FormDataEntryValue`. Un tableau, un `File`, `null`,
 * `undefined`, un nombre — tout ce qui n'est pas une chaîne est refusé au premier test, sans
 * conversion implicite. `String(["/"])` vaut `"/"` : un `toString()` complaisant aurait
 * transformé un tableau piégé en destination valide.
 */
export function isAllowedRedirect(value: unknown): value is AllowedRedirect {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_REDIRECT_LENGTH) return false;
  return (REDIRECT_ALLOWLIST as readonly string[]).includes(value);
}

/**
 * Rend une destination sûre : la valeur reçue si elle figure dans la liste blanche, `/` sinon.
 *
 * Ne lève jamais et ne signale jamais le refus. C'est le seul point de sortie : aucun appelant
 * ne doit lire la destination brute, y compris pour l'afficher.
 */
export function resolveRedirectDestination(value: unknown): AllowedRedirect {
  return isAllowedRedirect(value) ? value : DEFAULT_REDIRECT;
}
