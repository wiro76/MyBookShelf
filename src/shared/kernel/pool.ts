import pg from "pg";
import { requireDeferredEffectsEnvironment } from "../config/environment";

const { Pool } = pg;

let sharedPool: pg.Pool | undefined;

/**
 * Pool `pg` partagé par le processus. Il n'est construit qu'au premier appel, jamais à
 * l'import : `DATABASE_URL` est optionnelle au build et le prérendu Next ne doit pas
 * ouvrir de connexion.
 */
export function getDatabasePool(source: NodeJS.ProcessEnv = process.env): pg.Pool {
  if (!sharedPool) {
    const { databaseUrl } = requireDeferredEffectsEnvironment(source);
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
