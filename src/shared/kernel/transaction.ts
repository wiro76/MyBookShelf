import type { Pool, PoolClient } from "pg";

/**
 * Unité de travail transactionnelle (AD-3 : un client unique emprunté au Pool porte
 * toute l'unité de travail). Aucune règle métier ici : uniquement BEGIN / COMMIT /
 * ROLLBACK et la restitution du client au Pool.
 *
 * Ce module n'a volontairement aucun import à l'exécution (seuls des `import type`),
 * afin de rester importable tel quel depuis un test Node par effacement de types.
 */
export type UnitOfWork<T> = (client: PoolClient) => Promise<T>;

/** Exécute `run` dans une transaction portée par un client déjà emprunté. */
export async function runInTransaction<T>(client: PoolClient, run: UnitOfWork<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // La connexion est perdue : l'annulation est acquise côté serveur, on remonte l'erreur d'origine.
    }
    throw error;
  }
}

/** Emprunte un client au Pool, exécute `run` en transaction, restitue le client en `finally`. */
export async function withTransaction<T>(pool: Pool, run: UnitOfWork<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await runInTransaction(client, run);
  } finally {
    client.release();
  }
}

/** Emprunte un client au Pool sans ouvrir de transaction, et le restitue en `finally`. */
export async function withClient<T>(pool: Pool, run: UnitOfWork<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}
