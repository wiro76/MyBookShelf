import targets from "../../../config/environments.json";

export type AppEnvironment = keyof typeof targets;

const POSTGRES_CONNECTION_PATTERN = /^postgres(ql)?:\/\/[^\s]+$/i;
const PRODUCTION_MARKER_PATTERN = /production|prod-/i;

export function requireRuntimeEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const environment = source.APP_ENV as AppEnvironment | undefined;
  const fingerprint = source.TARGET_FINGERPRINT;
  const supabaseUrl = source.SUPABASE_URL;
  const supabaseKey = source.SUPABASE_ANON_KEY;

  if (!environment || !(environment in targets)) throw new Error("APP_ENV invalide ou absent");
  if (!fingerprint || fingerprint !== targets[environment]) throw new Error("TARGET_FINGERPRINT invalide ou absent");
  if (!supabaseUrl || !supabaseKey) throw new Error("Configuration Supabase absente");
  if (environment !== "production" && /production|prod-/i.test(`${fingerprint} ${supabaseUrl}`)) {
    throw new Error("Référence de production interdite hors production");
  }
  // DATABASE_URL est optionnelle au build (le prérendu des pages ne parle pas à Postgres).
  // Quand elle est présente, elle est soumise à la même règle d'isolation que le reste de la cible.
  const databaseUrl = source.DATABASE_URL;
  if (databaseUrl && environment !== "production" && PRODUCTION_MARKER_PATTERN.test(databaseUrl)) {
    throw new Error("Référence de production interdite hors production");
  }
  return { environment, fingerprint, supabaseUrl, supabaseKey };
}

export type DeferredEffectsEnvironment = {
  databaseUrl: string;
  workerSecret: string;
};

/**
 * Lecture tolérante des variables du worker d'effets différés.
 *
 * `DATABASE_URL` et `DEFERRED_EFFECTS_WORKER_SECRET` sont **optionnelles au build** : le build
 * Next prérend les pages et exécute `requireRuntimeEnvironment()`, qui ne doit jamais dépendre
 * d'une base de données. Elles ne deviennent obligatoires qu'à l'exécution du Route Handler,
 * via `requireDeferredEffectsEnvironment()`.
 */
export function readDeferredEffectsEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return {
    databaseUrl: source.DATABASE_URL,
    workerSecret: source.DEFERRED_EFFECTS_WORKER_SECRET,
  };
}

/**
 * Validation stricte, appelée uniquement à l'exécution du worker.
 * Absence ou incohérence = erreur explicite, aucun défaut implicite.
 */
export function requireDeferredEffectsEnvironment(source: NodeJS.ProcessEnv = process.env): DeferredEffectsEnvironment {
  const { databaseUrl, workerSecret } = readDeferredEffectsEnvironment(source);

  if (!databaseUrl) throw new Error("DATABASE_URL absent");
  if (!POSTGRES_CONNECTION_PATTERN.test(databaseUrl)) {
    throw new Error("DATABASE_URL doit être une chaîne de connexion postgresql://");
  }
  if (!workerSecret) throw new Error("DEFERRED_EFFECTS_WORKER_SECRET absent");
  if (workerSecret === source.SUPABASE_ANON_KEY) {
    throw new Error("DEFERRED_EFFECTS_WORKER_SECRET ne peut pas réutiliser SUPABASE_ANON_KEY");
  }

  // L'absence d'APP_ENV ne désactive PAS la garde d'isolation : elle vaut « non production ».
  // `requireRuntimeEnvironment` refuse déjà un APP_ENV absent ; ici, où la variable reste
  // optionnelle, on applique la lecture la plus stricte plutôt que de laisser passer un
  // DATABASE_URL de production sur un déploiement qui aurait oublié de définir APP_ENV.
  const environment = source.APP_ENV as AppEnvironment | undefined;
  if (environment !== "production" && PRODUCTION_MARKER_PATTERN.test(databaseUrl)) {
    throw new Error("Référence de production interdite hors production");
  }

  return { databaseUrl, workerSecret };
}
