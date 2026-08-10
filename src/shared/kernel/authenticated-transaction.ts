import type { PoolClient } from "pg";
import { describeError, logger } from "../observability";
import { getDatabasePool } from "./pool";

/**
 * Transaction authentifiée — story 1.6 (AC 2, AC 4 ; AD-3, AD-10).
 *
 * En CI comme en production, `DATABASE_URL` se connecte sous le rôle propriétaire, qui
 * contourne RLS. Un `select` émis sur le Pool nu voit donc TOUTES les lignes de tous les
 * utilisateurs, quelles que soient les politiques posées par la migration. Cette fonction
 * est le seul point où l'on redescend au rôle `authenticated` et où l'on déclare l'identité
 * de l'appelant à PostgreSQL. Toute donnée appartenant à un utilisateur passe par ici,
 * jamais par `getDatabasePool()` directement.
 *
 * Elle ne remplace pas la vérification applicative d'ownership : AD-10 exige la double
 * barrière, session **et** ownership vérifiés côté serveur, PUIS RLS qui répète l'isolation.
 * RLS est la seconde ligne, jamais la seule.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE : portée de transaction, jamais portée de session
 * ────────────────────────────────────────────────────────────────────────────────
 * `set role` et `set_config(name, value, false)` sont des réglages de SESSION : ils
 * survivent au `commit`. Le client, lui, retourne au Pool — qui le prêtera à la requête
 * suivante, d'un autre utilisateur, avec le rôle et le claim du précédent encore posés.
 * Le résultat n'est pas une panne : c'est une lecture silencieusement attribuée à la mauvaise
 * personne. Et comme le Pool a `max: 4`, la contamination ne frappe qu'une requête sur
 * quelques-unes, de façon intermittente et non reproductible.
 *
 * D'où, exclusivement :
 *   - `set local role authenticated` — annulé par le `commit`/`rollback` ;
 *   - `set_config('request.jwt.claim.sub', $1, true)` — le troisième argument `true`
 *     signifie « local à la transaction », et c'est le seul détail qui sépare l'isolation
 *     de la contamination.
 * Les deux exigent une transaction ouverte pour avoir le moindre effet : `set local` hors
 * transaction n'émet qu'un avertissement, et `set_config(..., true)` retomberait en portée
 * de session. Le `begin` précède donc obligatoirement les deux.
 *
 * Le claim est passé en PARAMÈTRE LIÉ, jamais concaténé (AD-3), et l'identifiant est validé
 * avant même d'emprunter un client : une valeur non validée finirait telle quelle dans
 * `set_config`, et `auth.uid()` la castant en `uuid`, une chaîne malformée ferait échouer
 * chaque politique de façon opaque plutôt qu'au point d'entrée.
 */

/**
 * Même motif que côté worker (`UUID_PATTERN`) et que `deferred.publish_effect` : bornes
 * fixes, aucun quantificateur non borné — cette expression s'applique à une valeur qui
 * remonte d'une requête HTTP.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Limite fixe et locale : une transaction bloquée ne monopolise pas le Pool indéfiniment. */
const SET_STATEMENT_TIMEOUT = "set local statement_timeout = '10s'";

/** Portée transaction : `set local`, annulé par le `commit` comme par le `rollback`. */
const SET_AUTHENTICATED_ROLE = "set local role authenticated";

/** Troisième argument `true` = `is_local`. Le changer casse l'isolation, silencieusement. */
const SET_JWT_SUBJECT = "select set_config('request.jwt.claim.sub', $1, true)";

export async function authenticatedTransaction<T>(
  userId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    throw new Error("authenticatedTransaction: identifiant utilisateur invalide");
  }
  if (typeof work !== "function") {
    throw new Error("authenticatedTransaction: unité de travail absente");
  }

  const client = await getDatabasePool().connect();
  // Renseigné uniquement si l'on n'a PAS pu ramener le client à un état propre. `release(err)`
  // avec une erreur DÉTRUIT la connexion au lieu de la rendre au Pool : mieux vaut payer une
  // reconnexion que remettre en circulation un client dont on ignore le rôle courant.
  let unusableReason: Error | undefined;

  try {
    await client.query("begin");
    await client.query(SET_STATEMENT_TIMEOUT);
    await client.query(SET_AUTHENTICATED_ROLE);
    await client.query(SET_JWT_SUBJECT, [userId]);
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      unusableReason = rollbackError instanceof Error ? rollbackError : new Error("rollback impossible");
      // Jamais `console` : la liste blanche du logger est la garantie qu'aucune donnée
      // personnelle ne sort. `describeError` ne rend que `errorCode` et `errorMessage`.
      logger.error("authenticatedTransaction: annulation impossible, connexion détruite", {
        operation: "authenticatedTransaction",
        ...describeError(rollbackError),
      });
    }
    throw error;
  } finally {
    client.release(unusableReason);
  }
}
