import pg from "pg";
import { requireDatabaseEnvironment } from "../config/environment";

const { Pool } = pg;

let sharedPool: pg.Pool | undefined;

/**
 * Pool `pg` partagé par le processus. Il n'est construit qu'au premier appel, jamais à
 * l'import : `DATABASE_URL` est optionnelle au build et le prérendu Next ne doit pas
 * ouvrir de connexion.
 *
 * Ne lit QUE `DATABASE_URL` (story 1.6). Il dépendait auparavant de
 * `requireDeferredEffectsEnvironment`, qui exige en plus `DEFERRED_EFFECTS_WORKER_SECRET` :
 * servir une page privée à un utilisateur authentifié n'a rien à voir avec le secret du
 * worker. L'appelant existant n'est pas affecté — le Route Handler des effets différés
 * appelle `requireDeferredEffectsEnvironment()` pour son propre compte, avant d'ouvrir le
 * Pool.
 */
export function getDatabasePool(source: NodeJS.ProcessEnv = process.env): pg.Pool {
  if (!sharedPool) {
    const { databaseUrl } = requireDatabaseEnvironment(source);
    sharedPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return sharedPool;
}

/** Ferme le Pool partagé. Réservé aux tests et aux arrêts explicites. */
export async function closeDatabasePool(): Promise<void> {
  const current = sharedPool;
  sharedPool = undefined;
  if (current) await current.end();
}
