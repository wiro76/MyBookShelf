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
// Idempotence de consommation neutralisée : `do update` fait compter la ligne en conflit,
// le doublon n'est plus reconnu et l'effet métier est appliqué deux fois. Le canari outbox
// doit le voir. Mutation de comportement, pas de test : elle porte sur le worker lui-même.
mutate("src/workers/deferred-effects/index.ts", (source) => source.replace("on conflict (message_id) do nothing", "on conflict (message_id) do update set processed_at = now()"), () => runMustFail("outbox", "npm", ["run", "ci:database"]));
// Expurgation par motifs neutralisée : la boucle qui remplace les fragments à haut risque
// est vidée. La liste blanche sur les clés reste en place — c'est justement l'intérêt :
// seule la seconde garde tombe, et le test de fuite doit malgré tout voir ressortir
// l'adresse, l'URL signée, la chaîne Postgres, le JWT et le secret du worker par les
// champs autorisés et par le message libre. Une seule ligne, donc aucun souci de CRLF.
mutate("src/shared/observability/logger.ts", (source) => source.replace("for (const pattern of REDACTION_PATTERNS) redacted = redacted.replace(pattern, REDACTION_PLACEHOLDER);", "/* expurgation neutralisée */"), () => runMustFail("leak", "npm", ["run", "ci:leak"]));
runMustFail("environment", process.execPath, ["scripts/verify-environment-isolation.mjs"], { env: { ...baseEnv, APP_ENV: "preview", TARGET_FINGERPRINT: "production-mbs-v1", SUPABASE_URL: "https://production.example.invalid", SUPABASE_ANON_KEY: "preview-only" } });
