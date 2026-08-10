import { readFileSync } from "node:fs";

const targets = JSON.parse(readFileSync(new URL("../config/environments.json", import.meta.url), "utf8"));
const entries = Object.entries(targets);
if (entries.length !== 4 || new Set(Object.values(targets)).size !== entries.length) {
  throw new Error("Les quatre fingerprints d'environnement doivent être renseignés et distincts.");
}

const environment = process.env.APP_ENV;
const fingerprint = process.env.TARGET_FINGERPRINT;
const targetUrl = process.env.SUPABASE_URL;
const targetKey = process.env.SUPABASE_ANON_KEY;
if (!environment || !fingerprint || !targetUrl || !targetKey) {
  throw new Error("APP_ENV, TARGET_FINGERPRINT, SUPABASE_URL et SUPABASE_ANON_KEY sont obligatoires.");
}
if (!(environment in targets)) throw new Error(`Environnement inconnu: ${environment}`);
if (fingerprint !== targets[environment]) throw new Error(`Fingerprint incompatible avec ${environment}.`);

const productionMarkers = [targets.production, "production", "prod-"];
if (environment !== "production" && productionMarkers.some((marker) => targetUrl.toLowerCase().includes(marker) || fingerprint.includes(marker))) {
  throw new Error("Une référence de production est interdite hors production.");
}

if (process.env.GITHUB_EVENT_NAME === "pull_request" && !["local", "preview"].includes(environment)) {
  throw new Error("Une pull request ne peut cibler que local ou preview.");
}
