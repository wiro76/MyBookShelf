import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { delimiter, dirname } from "node:path";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

const baseEnv = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}` };
// Sous Windows, npm est un .cmd : Node refuse de le lancer sans shell depuis la
// mitigation CVE-2024-27980 (ENOENT sur "npm"). Le shell n'est activé que pour lui ;
// les exécutions directes de process.execPath gardent le spawn direct, un chemin
// contenant des espaces ne survivant pas à cmd.exe.
const useShell = process.platform === "win32";
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { env: baseEnv, encoding: "utf8", maxBuffer: 20 * 1024 * 1024, shell: useShell && command === "npm", ...options });
  if (result.error) throw result.error;
  return result;
};
const runMustFail = (gate, command, args, options = {}) => {
  const result = run(command, args, options);
  if (result.status === 0 || result.status === null) throw new Error(`Mutation non détectée par la porte ${gate}`);
  process.stdout.write(`Porte ${gate}: mutation rejetée (exit ${result.status})\n`);
};
const temporary = (directory, extension, content, verify) => {
  const path = `${directory}/ci-invalid-${randomUUID()}.${extension}`;
  writeFileSync(path, content, { flag: "wx" });
  try { verify(path); } finally { unlinkSync(path); }
};
const mutate = (path, transform, verify) => {
  const original = readFileSync(path, "utf8");
  const changed = transform(original);
  if (changed === original) throw new Error(`Transformation inopérante refusée: ${path}`);
  writeFileSync(path, changed);
  try { verify(); } finally { writeFileSync(path, original); }
};

temporary("tests/unit", "test.mjs", 'import { test } from "node:test"; import assert from "node:assert/strict"; test("mutation", () => assert.equal(1, 2));\n', () => runMustFail("unit", "npm", ["run", "ci:unit"]));
temporary("tests/integration", "test.mjs", 'import { test } from "node:test"; test("mutation", () => { throw new Error("mutation"); });\n', () => runMustFail("integration", "npm", ["run", "ci:integration"]));
temporary("src/shared/config", "ts", "const value: string = 42; export { value };\n", () => runMustFail("types", "npm", ["run", "ci:types"]));
temporary(".", "mjs", "const broken = ;\n", () => runMustFail("lint", "npm", ["run", "ci:lint"]));
mutate("src/app/page.tsx", (source) => source.replace("export default function Home() {", 'export default function Home() { throw new Error("ci-static-mutation");'), () => {
  const types = run("npm", ["run", "ci:types"]);
  if (types.status !== 0) throw new Error("La mutation statique ne doit pas être une mutation TypeScript.");
  runMustFail("static", "npm", ["run", "ci:static"]);
});
temporary("tests/e2e", "spec.ts", 'import { expect, test } from "@playwright/test"; test("mutation", async () => expect(1).toBe(2));\n', () => runMustFail("browser", "npm", ["run", "ci:e2e", "--", "--grep", "mutation"]));
mutate("tests/fixtures/ux-budget.html", (source) => source.replace("list.append(list.firstElementChild);", "setTimeout(() => list.append(list.firstElementChild), 501);"), () => runMustFail("budgets", "npm", ["run", "ci:budgets"]));
// Remplacement multi-lignes tolérant aux fins de ligne : une copie de travail Windows
// est en CRLF et un "\n" littéral n'y matcherait jamais, rendant la mutation inopérante.
mutate("supabase/tests/database/rls.test.sql", (source) => source.replace(/using \(owner_id = \(select auth\.uid\(\)\)\)\r?\n(\s*)with check \(owner_id = \(select auth\.uid\(\)\)\)/, "using (true)\n$1with check (true)"), () => runMustFail("database", "npm", ["run", "ci:database"]));
// Intégrité du manifeste neutralisée : un digest fourni incorrectement n'est plus rejeté.
// Le test ciblé garde cette preuve négative rapide sans lancer les deux stacks du drill.
mutate(
  "scripts/recovery/manifest.mjs",
  (source) => source.replace("if (actualManifestDigest !== manifestSha256) fail(\"MANIFEST_DIGEST_MISMATCH\", \"Le digest du manifeste ne correspond pas\");", "if (false) fail(\"MANIFEST_DIGEST_MISMATCH\", \"Le digest du manifeste ne correspond pas\");"),
  () => runMustFail("recovery", process.execPath, ["--test", "--test-name-pattern", "la vérification contrôle digest", "tests/unit/recovery.test.mjs"]),
);
// Isolation par utilisateur neutralisée : les politiques `own_profile` et `own_private_notes`
// de la migration d'identité deviennent permissives. La table reste protégée par RLS, le rôle
// `authenticated` garde ses privilèges — seul le PRÉDICAT tombe. C'est la mutation la plus
// proche de l'erreur réelle : une politique écrite trop large, qui laisse tout passer sans
// qu'aucune erreur ne se produise nulle part.
//
// La porte `database` doit la voir DEUX FOIS, et par deux chemins indépendants :
// `identity-rls.test.sql` (`is_empty` sur les lignes d'autrui, `throws_ok` en 42501) et le
// canari d'authentification, qui lit sous l'identité d'un second compte réellement connecté.
// Aucune porte n'est créée : la liste figée de `ci-mutation.test.mjs` et le fixture
// `ci-gate-mutations.json` restent inchangés, à onze entrées.
//
// Remplacement multi-lignes tolérant aux fins de ligne, comme celui de `rls.test.sql` : une
// copie de travail Windows est en CRLF et un "\n" littéral n'y matcherait jamais. Le drapeau
// `g` est indispensable ici — la migration porte DEUX politiques, et n'en muter qu'une
// laisserait l'autre prouver l'isolation à elle seule.
mutate(
  "supabase/migrations/20260806000100_identity_expand.sql",
  (source) =>
    source.replace(
      /using \(user_id = \(select auth\.uid\(\)\)\)\r?\n(\s*)with check \(user_id = \(select auth\.uid\(\)\)\)/g,
      "using (true)\n$1with check (true)",
    ),
  () => runMustFail("database", "npm", ["run", "ci:database"]),
);
// Story 1.7 : rendre permissifs le signet et son registre de reçus doit être détecté par
// pgTAP et par le canari applicatif sous deux identités. On mute les deux politiques pour
// éviter qu'une seconde barrière intacte ne masque la régression testée.
mutate(
  "supabase/migrations/20260806000200_library_view_state_expand.sql",
  (source) =>
    source.replace(
      /using \(\(select auth\.uid\(\)\) = user_id\)\r?\n(\s*)with check \(\(select auth\.uid\(\)\) = user_id\)/g,
      "using (true)\n$1with check (true)",
    ),
  () => runMustFail("database", "npm", ["run", "ci:database"]),
);
// Idempotence de consommation neutralisée : `do update` fait compter la ligne en conflit,
// le doublon n'est plus reconnu et l'effet métier est appliqué deux fois. Le canari outbox
// doit le voir. Mutation de comportement, pas de test : elle porte sur le worker lui-même.
mutate("src/workers/deferred-effects/index.ts", (source) => source.replace("on conflict (message_id) do nothing", "on conflict (message_id) do update set processed_at = now()"), () => runMustFail("outbox", "npm", ["run", "ci:database"]));
// Expurgation par motifs neutralisée : la boucle qui remplace les fragments à haut risque
// est vidée. La liste blanche sur les clés reste en place — c'est justement l'intérêt :
// seule la seconde garde tombe, et le test de fuite doit malgré tout voir ressortir
// l'adresse, l'URL signée, la chaîne Postgres, le JWT et le secret du worker par les
// champs autorisés et par le message libre. Une seule ligne, donc aucun souci de CRLF.
mutate("src/shared/observability/redaction.ts", (source) => source.replace("for (const pattern of REDACTION_PATTERNS) redacted = redacted.replace(pattern, REDACTION_PLACEHOLDER);", "/* expurgation neutralisée */"), () => runMustFail("leak", "npm", ["run", "ci:leak"]));
// Liste blanche neutralisée : un champ personnel trivial devient autorisé. Cette mutation
// prouve la garde principale, pas seulement le filet par motifs.
mutate("src/shared/observability/logger.ts", (source) => source.replace('stoppedForTime: ["boolean"],', 'stoppedForTime: ["boolean"],\n  title: ["string"],'), () => runMustFail("leak", "npm", ["run", "ci:leak"]));
// Pseudonymisation acteur neutralisée : un e-mail brut passé en actorId ne doit jamais
// survivre au contexte ni au logger.
mutate("src/shared/observability/context.ts", (source) => source.replace("if (ACTOR_PSEUDONYM_PATTERN.test(trimmed)) clean[key] = trimmed;", "clean[key] = trimmed;"), () => runMustFail("leak", "npm", ["run", "ci:leak"]));
// Expurgation Sentry neutralisée : les sorties externes ne sont pas couvertes par les
// seules lignes JSON. La porte de fuite doit casser si les données libres redeviennent
// exportables dans `extra`.
mutate("src/shared/observability/sentry.ts", (source) => source.replace("delete sanitized.extra;", "/* extra conservé */"), () => runMustFail("leak", "npm", ["run", "ci:leak"]));
runMustFail("environment", process.execPath, ["scripts/verify-environment-isolation.mjs"], { env: { ...baseEnv, APP_ENV: "preview", TARGET_FINGERPRINT: "production-mbs-v1", SUPABASE_URL: "https://production.example.invalid", SUPABASE_ANON_KEY: "preview-only" } });
