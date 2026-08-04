import targets from "../../../config/environments.json";

export type AppEnvironment = keyof typeof targets;

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
  return { environment, fingerprint, supabaseUrl, supabaseKey };
}
