import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const reservePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return reject(new Error("Port local indisponible"));
    const port = address.port;
    server.close(() => resolve(port));
  });
});
const [apiPort, dbPort, shadowPort] = await Promise.all([reservePort(), reservePort(), reservePort()]);
const workdir = mkdtempSync(join(tmpdir(), "my-bookshelf-supabase-"));
cpSync("supabase", join(workdir, "supabase"), { recursive: true });
const projectId = `mbs-ci-${process.pid}-${Date.now()}`;
const configPath = join(workdir, "supabase/config.toml");
const config = readFileSync(configPath, "utf8")
  .replace(/project_id = ".*"/, `project_id = "${projectId}"`)
  .replace(/port = 54321/, `port = ${apiPort}`)
  .replace(/port = 54322/, `port = ${dbPort}`)
  .replace(/shadow_port = 54320/, `shadow_port = ${shadowPort}`);
writeFileSync(configPath, config);

const supabase = ["--yes", "supabase@2.101.0"];
// Sous Windows, npx est un .cmd : Node refuse de le lancer sans shell depuis la
// mitigation CVE-2024-27980 (ENOENT sur "npx", EINVAL sur "npx.cmd"). Le shell
// n'est activé que là où il est indispensable ; la CI Linux garde le spawn direct.
const useShell = process.platform === "win32";
// `workdir` vient de `mkdtempSync(tmpdir())`, donc du profil utilisateur Windows : il peut
// contenir `&`, `^`, `|`, `%`, `(` ou `)`, pas seulement des espaces. Sous `shell: true`,
// spawnSync ne fait que joindre command + args avec des espaces puis enveloppe la ligne
// entière dans des guillemets extérieurs (windowsVerbatimArgArgs) — un simple `"${value}"`
// ne protège donc PAS ces métacaractères, que cmd.exe continue d'interpréter même entre
// guillemets. Algorithme d'échappement robuste basé sur https://qntm.org/cmd (repris par
// cross-spawn) : on entoure de guillemets puis on échappe chaque métacaractère avec `^`.
// cmd.exe retire les accents circonflexes en scannant la ligne, laissant à l'argument
// final ses guillemets littéraux — que le programme cible interprète normalement.
const escapeCmdArgument = (value) => {
  let escaped = String(value);
  // Une suite de `\` juste avant un `"` (ou en fin de chaîne) doit être doublée pour que
  // le guillemet ajouté ci-dessous reste littéral côté analyse d'arguments de la cible.
  escaped = escaped.replace(/(\\*)"/g, '$1$1\\"');
  escaped = escaped.replace(/(\\*)$/, "$1$1");
  escaped = `"${escaped}"`;
  escaped = escaped.replace(/[()%!^"<>&|]/g, "^$&");
  return escaped;
};
const quote = (value) => (useShell ? escapeCmdArgument(value) : value);
const run = (args, options = {}) => {
  const result = spawnSync("npx", [...supabase, ...args, "--workdir", quote(workdir)], { stdio: "inherit", ...options, shell: useShell });
  if (result.status !== 0) throw new Error(`Supabase a échoué: ${args.join(" ")}${result.error ? ` (${result.error.code})` : ""}`);
};

/**
 * Même invocation que `run()`, mais la sortie standard est CAPTURÉE au lieu d'être héritée.
 *
 * `stdio: "inherit"` renvoie la sortie au terminal et rend `result.stdout` nul : c'est très
 * bien pour `start` et `db reset`, dont on veut voir la progression, et inutilisable pour
 * `status -o json`, dont on veut lire le contenu. D'où ce second point d'entrée, réservé aux
 * commandes dont la sortie est une donnée.
 *
 * La CLI écrit sur stdout des lignes qui ne font pas partie du JSON — au minimum
 * « Stopped services: […] » et l'avis de mise à jour de version. On ne parse donc pas la
 * sortie brute : on en extrait le premier objet JSON, du premier `{` au dernier `}`.
 */
const runCapture = (args) => {
  const result = spawnSync("npx", [...supabase, ...args, "--workdir", quote(workdir)], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: useShell,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    throw new Error(`Supabase a échoué: ${args.join(" ")}${result.error ? ` (${result.error.code})` : ""}`);
  }
  return result.stdout ?? "";
};

/**
 * Lit les clés de la pile ÉPHÉMÈRE en cours et compose l'URL de son API.
 *
 * Les clés ne peuvent pas être écrites en dur : `supabase start` les dérive du secret JWT du
 * projet. Les lire ici est la seule façon d'en donner des valeurs justes au canari
 * d'authentification.
 *
 * ⚠️ L'URL de l'API, elle, n'est PAS lue du statut. Mesuré sur la CLI 2.101.0 avec cette
 * liste d'exclusions, `supabase status -o json` ne rend que
 * `ANON_KEY, DB_URL, JWT_SECRET, PUBLISHABLE_KEY, SECRET_KEY, SERVICE_ROLE_KEY` : `API_URL`
 * est absent, la CLI le rattachant à PostgREST — que le harnais exclut délibérément, AD-3
 * imposant node-postgres pour toute donnée. Kong écoute pourtant bien, et sur un port que ce
 * script CONNAÎT puisqu'il l'a lui-même réservé et substitué dans la configuration copiée :
 * `apiPort`. On le compose donc, plutôt que de réintégrer un conteneur pour le seul plaisir de
 * lire une chaîne. On accepte malgré tout `API_URL` s'il réapparaît dans une version future.
 *
 * Les noms des clés ont changé au fil des versions (`ANON_KEY` / `SERVICE_ROLE_KEY`
 * historiques, `PUBLISHABLE_KEY` / `SECRET_KEY` depuis les clés d'API nommées ; la 2.101.0
 * rend les deux familles). On accepte les deux et on échoue BRUYAMMENT si aucune ne répond :
 * un canari lancé sans clé de service échouerait plus loin, sur un 401 obscur, et le message
 * ne désignerait pas la cause.
 */
const readStackCredentials = () => {
  const sortie = runCapture(["status", "-o", "json"]);
  const debut = sortie.indexOf("{");
  const fin = sortie.lastIndexOf("}");
  if (debut === -1 || fin <= debut) throw new Error("`supabase status -o json` n'a rendu aucun objet JSON.");
  const statut = JSON.parse(sortie.slice(debut, fin + 1));

  const apiUrl = statut.API_URL || `http://127.0.0.1:${apiPort}`;
  const anonKey = statut.ANON_KEY ?? statut.PUBLISHABLE_KEY;
  const serviceRoleKey = statut.SERVICE_ROLE_KEY ?? statut.SECRET_KEY;
  const manquants = Object.entries({ ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey })
    .filter(([, valeur]) => typeof valeur !== "string" || valeur.length === 0)
    .map(([nom]) => nom);
  if (manquants.length > 0) {
    throw new Error(
      `\`supabase status -o json\` n'expose pas ${manquants.join(", ")} ` +
        `(champs reçus : ${Object.keys(statut).join(", ")}).`,
    );
  }
  if (anonKey === serviceRoleKey) throw new Error("La clé anon et la clé de service ne peuvent pas être identiques.");
  return { apiUrl, anonKey, serviceRoleKey };
};

try {
  // `gotrue` et `kong` ne sont PLUS exclus — story 1.6, T5. Le canari d'authentification doit
  // se connecter réellement, ce qu'aucune substitution de rôle en base ne peut simuler : c'est
  // GoTrue qui vérifie le mot de passe, signe le jeton et refuse un couple erroné, et c'est
  // Kong qui expose `/auth/v1` sur le port de `[api]`. Tout le reste demeure exclu, `mailpit`
  // compris : `[auth.email] enable_confirmations = false` supprime le besoin d'un serveur de
  // courriel. `postgrest` reste exclu et GoTrue démarre sans lui — AD-3 impose node-postgres
  // pour toute donnée, aucune preuve ne passe par PostgREST.
  run(["start", "--exclude", "studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta,postgrest,realtime,storage-api"]);
  run(["db", "reset", "--local"]);
  const sql = [
    "create extension if not exists pgtap with schema extensions;",
    readFileSync("supabase/tests/database/rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/identity-rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/library-view-state-rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/library-foundation-rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/library-want-to-read-rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/media-personal-cover-rls.test.sql", "utf8"),
    readFileSync("supabase/tests/database/migration-compatibility.test.sql", "utf8"),
    readFileSync("supabase/tests/database/deferred-effects.test.sql", "utf8"),
  ].join("\n");
  const pgTap = spawnSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8" });
  process.stdout.write(pgTap.stdout ?? "");
  process.stderr.write(pgTap.stderr ?? "");
  if (pgTap.status !== 0 || /^\s*not ok\b/m.test(pgTap.stdout ?? "")) throw new Error("La suite pgTAP a échoué.");
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;
  const app = spawnSync(process.execPath, ["tests/integration/database-command-canary.mjs"], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: databaseUrl } });
  if (app.status !== 0) throw new Error("Le canari transactionnel applicatif a échoué.");
  // Le canari outbox importe le Route Handler : il lui faut la chaîne de connexion et le
  // secret du worker, injectés ici pour rester alignés sur la base éphémère du harnais.
  const outbox = spawnSync(process.execPath, ["tests/integration/database-outbox-canary.mjs"], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl, DEFERRED_EFFECTS_WORKER_SECRET: `ci-outbox-${randomUUID()}` } });
  if (outbox.status !== 0) throw new Error("Le canari outbox transactionnel a échoué.");
  // Le canari d'authentification a besoin de la pile complète : l'URL de l'API portée par Kong
  // et les DEUX clés — la clé de service pour semer les comptes par l'API admin, la clé anon
  // pour se connecter comme le ferait l'application. Le spread de `process.env` est
  // indispensable : sans lui, le sous-processus perdrait PATH, SystemRoot et tout le reste.
  const { apiUrl, anonKey, serviceRoleKey } = readStackCredentials();
  const auth = spawnSync(process.execPath, ["tests/integration/database-identity-auth-canary.mjs"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_URL: databaseUrl,
      DATABASE_URL: databaseUrl,
      SUPABASE_URL: apiUrl,
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
  });
  if (auth.status !== 0) throw new Error("Le canari d'authentification a échoué.");
  const libraryViewState = spawnSync(process.execPath, ["tests/integration/database-library-view-state-canary.mjs"], {
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl },
  });
  if (libraryViewState.status !== 0) throw new Error("Le canari de reprise du contexte a échoué.");
  const libraryFoundation = spawnSync(process.execPath, ["tests/integration/database-library-foundation-canary.mjs"], {
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl },
  });
  if (libraryFoundation.status !== 0) throw new Error("Le canari de fondation du rangement a échoué.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  // Même mécanique que `run()` : sans `shell` ni `quote()`, l'arrêt échouait en ENOENT
  // sous Windows et son statut n'était jamais lu — la pile éphémère survivait au harnais
  // et laissait des conteneurs orphelins. On n'échoue pas ici : on est dans un `finally`,
  // l'erreur d'origine doit primer. On avertit, bruyamment.
  const stopped = spawnSync("npx", [...supabase, "stop", "--no-backup", "--workdir", quote(workdir)], { stdio: "inherit", shell: useShell });
  if (stopped.status !== 0) {
    const cause = stopped.error ? stopped.error.code : `code de sortie ${stopped.status}`;
    console.warn(
      `AVERTISSEMENT: arrêt de la pile Supabase éphémère "${projectId}" impossible (${cause}). ` +
        `Des conteneurs Docker orphelins subsistent probablement : vérifier avec ` +
        `\`docker ps -a --filter "name=${projectId}"\` puis les supprimer manuellement.`,
    );
  }
  rmSync(workdir, { recursive: true, force: true });
}
