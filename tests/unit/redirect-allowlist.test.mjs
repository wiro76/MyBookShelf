import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Tests unitaires de la validation de destination — story 1.6 (AC 1 ; AD-10).
 *
 * Aucune base, aucune I/O, aucun réseau : uniquement les cas HOSTILES que la story énumère.
 * L'enseignement n° 2 de la story 1.3 — « une garde qui ne garde rien » — désigne exactement
 * cette fonction : une validation de destination qui accepterait une chaîne vide ou un `//`
 * transformerait la page de connexion en redirection ouverte, sur une personne dont la session
 * vient précisément d'être établie.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POINT DUR : test en .mjs, module en TypeScript, deux versions de Node
 * ────────────────────────────────────────────────────────────────────────────────
 * Même remède que `tests/unit/observability.test.mjs` : import direct, puis relance UNIQUE
 * dans un sous-processus muni de `--experimental-strip-types` sur `ERR_UNKNOWN_FILE_EXTENSION`,
 * sentinelle d'environnement contre la boucle, et `NODE_TEST_CONTEXT` RETIRÉ du sous-processus
 * — sans quoi `node:test` détecte un lancement récursif, n'exécute AUCUN test et rend un
 * succès en trompe-l'œil. Le bloc `registerHooks` résout `@/…`, les imports relatifs sans
 * extension entre fichiers `.ts`, et le JSON de configuration.
 */

const RACINE = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINELLE_RELANCE = "TESTS_UNITAIRES_EFFACEMENT_TYPES";

const estFichier = (chemin) => {
  try {
    return statSync(chemin).isFile();
  } catch {
    return false;
  }
};

const resoudreSource = (base, specificateur) => {
  const cible = resolvePath(base, specificateur);
  for (const candidat of [cible, `${cible}.ts`, `${cible}.tsx`, resolvePath(cible, "index.ts")]) {
    if (estFichier(candidat)) return candidat;
  }
  return null;
};

registerHooks({
  resolve(specificateur, contexte, suivant) {
    let cible = null;
    if (specificateur.startsWith("@/")) {
      cible = resoudreSource(resolvePath(RACINE, "src"), specificateur.slice(2));
    } else if (specificateur.startsWith(".") && contexte.parentURL?.endsWith(".ts")) {
      cible = resoudreSource(dirname(fileURLToPath(contexte.parentURL)), specificateur);
    }
    if (cible) return { url: pathToFileURL(cible).href, shortCircuit: true };
    return suivant(specificateur, contexte);
  },
  load(url, contexte, suivant) {
    if (url.startsWith("file:") && url.endsWith(".json")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", shortCircuit: true, source: `export default ${source};` };
    }
    return suivant(url, contexte);
  },
});

const estErreurEffacementTypes = (erreur) =>
  erreur?.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
  erreur?.code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING" ||
  /Unknown file extension "\.tsx?"/.test(String(erreur?.message ?? ""));

let moduleSousTest = null;
try {
  moduleSousTest = await import(
    pathToFileURL(resolvePath(RACINE, "src/modules/identity/application/redirect-allowlist.ts")).href
  );
} catch (erreur) {
  if (process.env[SENTINELLE_RELANCE] || !estErreurEffacementTypes(erreur)) throw erreur;
  const environnement = { ...process.env, [SENTINELLE_RELANCE]: "1" };
  delete environnement.NODE_TEST_CONTEXT;
  const relance = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: environnement,
  });
  process.exitCode = relance.status ?? 1;
}

if (moduleSousTest) {
  const {
    DEFAULT_REDIRECT,
    PRIVATE_LIBRARY_REDIRECT,
    REDIRECT_ALLOWLIST,
    isAllowedRedirect,
    resolveRedirectDestination,
  } = moduleSousTest;

  // --- La liste blanche elle-même ------------------------------------------

  test("la liste blanche est littérale et ne contient que les deux destinations prévues", () => {
    assert.deepEqual([...REDIRECT_ALLOWLIST], ["/", "/bibliotheque"]);
    assert.equal(DEFAULT_REDIRECT, "/");
    assert.equal(PRIVATE_LIBRARY_REDIRECT, "/bibliotheque");
  });

  test("les destinations autorisées sont acceptées telles quelles", () => {
    for (const autorisee of REDIRECT_ALLOWLIST) {
      assert.equal(isAllowedRedirect(autorisee), true, autorisee);
      assert.equal(resolveRedirectDestination(autorisee), autorisee);
    }
  });

  // --- Cas hostiles énumérés par la story ----------------------------------

  const CAS_HOSTILES = [
    // URL absolue : la forme canonique de la redirection ouverte.
    "https://evil.test",
    "http://evil.test/bibliotheque",
    "HTTPS://EVIL.TEST",
    // Relative au protocole : le navigateur y voit un HÔTE, pas un chemin. C'est le cas que
    // toute garde naïve « ça commence par / donc c'est relatif » laisse passer.
    "//evil.test",
    "//evil.test/bibliotheque",
    "///evil.test",
    // Barre inversée : plusieurs navigateurs la normalisent en `/`, donc `\\evil.test` se
    // comporte comme `//evil.test`.
    "\\\\evil.test",
    "/\\evil.test",
    "\\evil.test",
    // Schémas exécutables ou porteurs de contenu.
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    // Traversée : la destination ressemble à une entrée de la liste sans en être une.
    "/bibliotheque/../admin",
    "/bibliotheque/..%2fadmin",
    "/bibliotheque%2F..%2Fadmin",
    // Voisines de la liste, et refusées : la comparaison est une ÉGALITÉ, pas un préfixe.
    "/bibliotheque/",
    "/bibliotheque?x=1",
    "/bibliotheque#ancre",
    "/Bibliotheque",
    "/BIBLIOTHEQUE",
    " /bibliotheque",
    "/bibliotheque ",
    "/bibliotheque\n",
    // Chemins hors liste.
    "/admin",
    "/connexion",
    "/api/deferred-effects/process",
    "bibliotheque",
    // Chaîne vide et blancs.
    "",
    " ",
    "\t",
  ];

  test("toute valeur hostile est refusée et retombe silencieusement sur /", () => {
    for (const hostile of CAS_HOSTILES) {
      assert.equal(isAllowedRedirect(hostile), false, `aurait dû être refusé : ${JSON.stringify(hostile)}`);
      assert.equal(
        resolveRedirectDestination(hostile),
        DEFAULT_REDIRECT,
        `aurait dû retomber sur / : ${JSON.stringify(hostile)}`,
      );
    }
  });

  test("le refus ne réaffiche jamais la valeur refusée", () => {
    // La seule sortie possible est l'une des deux destinations autorisées : il n'existe
    // aucun chemin par lequel un fragment de l'entrée pourrait ressortir.
    for (const hostile of CAS_HOSTILES) {
      const resultat = resolveRedirectDestination(hostile);
      assert.ok(REDIRECT_ALLOWLIST.includes(resultat));
    }
  });

  // --- Valeurs qui ne sont pas des chaînes ---------------------------------

  test("null, undefined et les types non textuels sont refusés sans conversion", () => {
    // `String(["/"])` vaut `"/"` : une conversion complaisante aurait fait d'un tableau
    // piégé — la forme même que rendent les `searchParams` répétés de Next — une destination
    // valide.
    const NON_TEXTUELS = [null, undefined, 0, 1, true, false, ["/"], ["/bibliotheque"], { toString: () => "/" }, Symbol("/")];
    for (const valeur of NON_TEXTUELS) {
      assert.equal(isAllowedRedirect(valeur), false, String(typeof valeur));
      assert.equal(resolveRedirectDestination(valeur), DEFAULT_REDIRECT);
    }
  });

  // --- Coût sur une valeur démesurée ---------------------------------------

  test("une valeur très longue est refusée immédiatement, sans rétrogradation", () => {
    // Enseignement n° 6 de la story 1.3 : un quantificateur non borné sur du texte utilisateur
    // a déjà coûté 72 secondes à ce projet. Ce module n'emploie aucune expression régulière —
    // ce test le PROUVE au lieu de le supposer. Les trois formes ci-dessous sont celles qui
    // font exploser un moteur d'expressions régulières mal borné : répétition d'un caractère
    // unique, préfixe valide suivi d'une queue interminable, et alternance de séparateurs.
    const TRES_LONGUES = [
      "/".repeat(1_000_000),
      `/bibliotheque${"a".repeat(1_000_000)}`,
      `/${"a.".repeat(500_000)}`,
    ];
    const debut = process.hrtime.bigint();
    for (const longue of TRES_LONGUES) {
      assert.equal(isAllowedRedirect(longue), false);
      assert.equal(resolveRedirectDestination(longue), DEFAULT_REDIRECT);
    }
    const millisecondes = Number(process.hrtime.bigint() - debut) / 1e6;
    assert.ok(millisecondes < 100, `refus trop lent : ${millisecondes.toFixed(1)} ms`);
  });
}
