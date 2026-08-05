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

export type DatabaseEnvironment = {
  databaseUrl: string;
};

/**
 * Lecture tolérante de la seule chaîne de connexion.
 *
 * `DATABASE_URL` est **optionnelle au build** : le prérendu Next ne parle pas à Postgres.
 * Elle ne devient obligatoire qu'à l'ouverture effective du Pool.
 */
export function readDatabaseEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return {
    databaseUrl: source.DATABASE_URL,
  };
}

/**
 * Validation stricte de la chaîne de connexion, et d'elle seule.
 *
 * Extraite de `requireDeferredEffectsEnvironment` (story 1.6) : ouvrir une connexion pour
 * un utilisateur authentifié n'a aucun rapport avec `DEFERRED_EFFECTS_WORKER_SECRET`, et
 * exiger ce secret sur ce chemin reviendrait soit à le rendre obligatoire pour servir une
 * page privée, soit à le définir à une valeur factice — c'est-à-dire à désarmer la garde du
 * worker. Le couple worker conserve son contrat en délégant ici ; ses appelants ne voient
 * aucune différence.
 */
export function requireDatabaseEnvironment(source: NodeJS.ProcessEnv = process.env): DatabaseEnvironment {
  const { databaseUrl } = readDatabaseEnvironment(source);

  if (!databaseUrl) throw new Error("DATABASE_URL absent");
  if (!POSTGRES_CONNECTION_PATTERN.test(databaseUrl)) {
    throw new Error("DATABASE_URL doit être une chaîne de connexion postgresql://");
  }

  // L'absence d'APP_ENV ne désactive PAS la garde d'isolation : elle vaut « non production ».
  // `requireRuntimeEnvironment` refuse déjà un APP_ENV absent ; ici, où la variable reste
  // optionnelle, on applique la lecture la plus stricte plutôt que de laisser passer un
  // DATABASE_URL de production sur un déploiement qui aurait oublié de définir APP_ENV.
  const environment = source.APP_ENV as AppEnvironment | undefined;
  if (environment !== "production" && PRODUCTION_MARKER_PATTERN.test(databaseUrl)) {
    throw new Error("Référence de production interdite hors production");
  }

  return { databaseUrl };
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
  const { workerSecret } = readDeferredEffectsEnvironment(source);

  // Les trois contrôles sur `DATABASE_URL` — présence, forme, isolation de production —
  // sont délégués à `requireDatabaseEnvironment`, à l'identique et dans le même ordre
  // relatif : ils précédaient déjà la vérification du secret.
  const { databaseUrl } = requireDatabaseEnvironment(source);

  if (!workerSecret) throw new Error("DEFERRED_EFFECTS_WORKER_SECRET absent");
  if (workerSecret === source.SUPABASE_ANON_KEY) {
    throw new Error("DEFERRED_EFFECTS_WORKER_SECRET ne peut pas réutiliser SUPABASE_ANON_KEY");
  }

  return { databaseUrl, workerSecret };
}

export type IdentityEnvironment = {
  serviceRoleKey: string;
};

/**
 * Lecture tolérante des variables d'identité — story 1.6.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` est **optionnelle au build**, comme toutes les variables de ce
 * fichier : le prérendu Next n'administre aucun compte. Elle ne devient obligatoire qu'au
 * moment d'appeler l'API admin de Supabase Auth, via `requireIdentityEnvironment()`.
 */
export function readIdentityEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return {
    serviceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/**
 * Validation stricte, appelée uniquement au moment d'agir avec les droits de service.
 *
 * La clé de service contourne RLS et vaut administration complète du projet : AD-10 la
 * cantonne au serveur. Aucun repli, aucun défaut implicite — et la même règle de
 * non-réutilisation que les autres secrets, puisqu'une clé de service qui vaudrait la clé
 * anon serait publiée au navigateur avec elle.
 */
export function requireIdentityEnvironment(source: NodeJS.ProcessEnv = process.env): IdentityEnvironment {
  const { serviceRoleKey } = readIdentityEnvironment(source);

  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY absent");
  if (serviceRoleKey === source.SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ne peut pas réutiliser SUPABASE_ANON_KEY");
  }

  return { serviceRoleKey };
}

export type ObservabilityEnvironment = {
  pseudonymKey: string;
};

/**
 * Longueur minimale de la clé de pseudonymisation. HMAC-SHA256 accepte n'importe quelle
 * longueur de clé, y compris `"a"` — et une clé devinable rend la pseudonymisation
 * réversible par force brute sur un espace d'un seul utilisateur. 32 caractères est le
 * plancher, pas une cible.
 */
const PSEUDONYM_KEY_MIN_LENGTH = 32;

/**
 * Lecture tolérante des variables d'observabilité.
 *
 * `OBSERVABILITY_PSEUDONYM_KEY` est **optionnelle au build** : le build Next prérend les
 * pages et n'a aucune raison de pseudonymiser un acteur. La rendre obligatoire au
 * chargement casserait `ci:static` — c'est déjà arrivé en 1.3. Elle ne devient
 * obligatoire qu'au moment où l'on pseudonymise réellement, via
 * `requireObservabilityEnvironment()`.
 */
export function readObservabilityEnvironment(source: NodeJS.ProcessEnv = process.env) {
  return {
    pseudonymKey: source.OBSERVABILITY_PSEUDONYM_KEY,
  };
}

/**
 * Validation stricte, appelée uniquement au moment de pseudonymiser.
 * Absence ou faiblesse = erreur explicite, **jamais** de repli sur un hachage nu :
 * sur une bibliothèque à un seul utilisateur, un SHA-256 sans clé est réversible
 * immédiatement — le hachage nu n'est pas une pseudonymisation dégradée, c'est une
 * absence de pseudonymisation.
 */
export function requireObservabilityEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ObservabilityEnvironment {
  const { pseudonymKey } = readObservabilityEnvironment(source);

  if (!pseudonymKey) throw new Error("OBSERVABILITY_PSEUDONYM_KEY absent");
  if (pseudonymKey.trim().length < PSEUDONYM_KEY_MIN_LENGTH) {
    throw new Error(`OBSERVABILITY_PSEUDONYM_KEY doit faire au moins ${PSEUDONYM_KEY_MIN_LENGTH} caractères`);
  }
  // Même règle de non-réutilisation que le secret du worker : une clé partagée avec une
  // valeur publiée (clé anon) rendrait la pseudonymisation inversible par quiconque la lit.
  if (pseudonymKey === source.SUPABASE_ANON_KEY) {
    throw new Error("OBSERVABILITY_PSEUDONYM_KEY ne peut pas réutiliser SUPABASE_ANON_KEY");
  }
  if (pseudonymKey === source.DEFERRED_EFFECTS_WORKER_SECRET) {
    throw new Error("OBSERVABILITY_PSEUDONYM_KEY ne peut pas réutiliser DEFERRED_EFFECTS_WORKER_SECRET");
  }

  return { pseudonymKey };
}
