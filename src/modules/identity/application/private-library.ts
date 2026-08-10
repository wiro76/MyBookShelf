import type { PoolClient } from "pg";
import { authenticatedTransaction } from "@/shared/kernel";
import { describeError, logger } from "@/shared/observability";

/**
 * Lecture témoin de la bibliothèque privée — story 1.6 (AC 2, AC 4 ; AD-3, AD-10).
 *
 * Elle n'a pas de valeur produit : elle existe pour que la route privée prouve la CHAÎNE
 * COMPLÈTE de bout en bout, cookie → `getUser()` vérifié → `authenticatedTransaction` → SQL
 * paramétré → RLS. Une route privée qui se contenterait d'afficher « tu es connecté » ne
 * prouverait que la première moitié.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * LA DOUBLE BARRIÈRE, LES DEUX MOITIÉS VISIBLES DANS CE FICHIER
 * ────────────────────────────────────────────────────────────────────────────────
 * 1. **Ownership applicatif** : chaque requête porte son `where user_id = $1`, avec
 *    l'identifiant VÉRIFIÉ par `getUser()`, passé en paramètre lié (AD-3), jamais concaténé.
 * 2. **RLS** : `authenticatedTransaction` pose `set local role authenticated` et
 *    `request.jwt.claim.sub`, donc les politiques `own_profile` et `own_private_notes`
 *    filtrent une seconde fois sur `auth.uid()`.
 *
 * Le `where` n'est pas redondant avec RLS, et RLS n'est pas redondant avec le `where` : AD-10
 * exige les deux, et chacun rattrape la défaillance de l'autre — un `where` oublié est couvert
 * par la politique, une politique manquante sur une future table est couverte par le `where`.
 * RLS est la seconde ligne, jamais la seule.
 */

export type PrivateLibrarySummary = {
  /** Nom d'affichage du profil, `null` si aucun profil n'a encore été créé pour ce compte. */
  displayName: string | null;
  /** Nombre de notes privées visibles — c'est-à-dire, RLS appliquée, celles de ce compte. */
  noteCount: number;
};

const OPERATION = "identity/private-library";

/**
 * Rend le résumé privé du compte, ou `null` si la base est injoignable.
 *
 * `null` n'est PAS « aucune donnée » : c'est « on ne sait pas ». L'appelant rend un état
 * dégradé avec une action Réessayer plutôt qu'une page 500 — et surtout, jamais un état vide
 * qui laisserait croire que la bibliothèque a été effacée.
 */
export async function loadPrivateLibrarySummary(userId: string): Promise<PrivateLibrarySummary | null> {
  try {
    return await authenticatedTransaction(userId, async (client: PoolClient) => {
      const profile = await client.query<{ display_name: string }>(
        "select display_name from identity.profiles where user_id = $1",
        [userId],
      );
      const notes = await client.query<{ total: number }>(
        "select count(*)::int as total from identity.private_notes where user_id = $1",
        [userId],
      );
      return {
        displayName: profile.rows[0]?.display_name ?? null,
        noteCount: Number(notes.rows[0]?.total ?? 0),
      };
    });
  } catch (error) {
    // Ni l'identifiant en clair, ni le nom d'affichage, ni le contenu d'une note : seul le
    // code et le message du fournisseur, que la liste blanche du logger expurge encore.
    logger.error("Lecture de la bibliothèque privée impossible", {
      operation: OPERATION,
      outcome: "execution_echouee",
      ...describeError(error),
    });
    return null;
  }
}
