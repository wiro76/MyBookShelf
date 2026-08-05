import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Tests unitaires du socle d'observabilité — story 1.4 (AC 1, 3, 4).
 *
 * Aucune base, aucune I/O, aucun réseau : contexte de corrélation, pseudonymisation,
 * description et stabilisation des erreurs, liste blanche du logger.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POINT DUR : test en .mjs, socle en TypeScript, deux versions de Node
 * ────────────────────────────────────────────────────────────────────────────────
 * Même remède que `tests/unit/deferred-effects.test.mjs` : l'effacement de types natif
 * est actif par défaut sur la CI (Node 24.18.0) mais demande `--experimental-strip-types`
 * sur Node 22.15.1. Ce fichier tente l'import puis, sur `ERR_UNKNOWN_FILE_EXTENSION`, se
 * relance UNE seule fois dans un sous-processus muni du drapeau ; une sentinelle
 * d'environnement interdit la boucle et le code de sortie du sous-processus devient celui
 * du fichier de test. `NODE_TEST_CONTEXT` est RETIRÉ de l'environnement du sous-processus :
 * sans cela, `node:test` détecte un lancement récursif, n'exécute AUCUN test et rend un
 * succès en trompe-l'œil.
 *
 * Différence avec `deferred-effects.test.mjs` : le socle a des imports relatifs (le baril
 * réexporte ses cinq modules) et remonte jusqu'à `@/shared/config/environment`, qui importe
 * lui-même un JSON sans attribut `with { type: "json" }`. Il faut donc aussi le bloc
 * `registerHooks` du canari outbox — résolution de `@/…`, des imports relatifs sans
 * extension entre fichiers `.ts`, et lecture du JSON de configuration. Aucun transpileur,
 * aucune dépendance.
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

let socle = null;
try {
  socle = await import(pathToFileURL(resolvePath(RACINE, "src/shared/observability/index.ts")).href);
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

if (socle) {
  const {
    CORRELATION_VALUE_MAX_LENGTH,
    DEFAULT_STABLE_ERROR_CODE,
    ERROR_MESSAGE_MAX_LENGTH,
    LOG_LINE_MAX_BYTES,
    UNEXPECTED_ERROR_CODE,
    correlationAttributes,
    createCorrelationId,
    currentCorrelation,
    describeError,
    formatLogLine,
    pseudonymize,
    pseudonymizeActor,
    runWithCorrelation,
    toStableError,
    withCorrelation,
  } = socle;

  const CLE = "cle-de-test-de-pseudonymisation-32-caracteres-minimum";
  const AUTRE_CLE = "autre-cle-de-test-de-pseudonymisation-32-caracteres";
  const environnementAvecCle = { OBSERVABILITY_PSEUDONYM_KEY: CLE };

  // --- Identifiants --------------------------------------------------------

  test("createCorrelationId produit un UUIDv7 triable par date", () => {
    const ancien = createCorrelationId(1_700_000_000_000);
    const recent = createCorrelationId(1_800_000_000_000);
    assert.match(ancien, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(recent, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(ancien < recent, "l'ordre lexicographique doit suivre l'ordre chronologique");
    assert.notEqual(createCorrelationId(1_700_000_000_000), ancien);
  });

  // --- Contexte de corrélation ---------------------------------------------

  test("hors de tout contexte, les attributs de corrélation sont vides", () => {
    assert.deepEqual(correlationAttributes(), {});
    assert.deepEqual(currentCorrelation(), {});
  });

  test("correlationAttributes ne contient que les clés présentes", () => {
    runWithCorrelation({ requestId: "req-1", jobId: "job-1" }, () => {
      const attributs = correlationAttributes();
      assert.deepEqual(attributs, { requestId: "req-1", jobId: "job-1" });
      assert.deepEqual(Object.keys(attributs), ["requestId", "jobId"]);
      assert.ok(!("actorId" in attributs));
      assert.ok(!("commandId" in attributs));
    });
  });

  test("le contexte écarte les clés inconnues et les valeurs inexploitables", () => {
    runWithCorrelation(
      { requestId: "req-1", commandId: "   ", actorId: 42, jobId: "", email: "zan@example.invalid" },
      () => {
        assert.deepEqual(correlationAttributes(), { requestId: "req-1" });
      },
    );
  });

  test("le contexte borne la longueur des valeurs stockées", () => {
    runWithCorrelation({ requestId: "r".repeat(CORRELATION_VALUE_MAX_LENGTH + 500) }, () => {
      assert.equal(correlationAttributes().requestId.length, CORRELATION_VALUE_MAX_LENGTH);
    });
  });

  test("withCorrelation enrichit sans perdre l'existant", () => {
    runWithCorrelation({ requestId: "req-1" }, () => {
      withCorrelation({ jobId: "job-1" }, () => {
        assert.deepEqual(correlationAttributes(), { requestId: "req-1", jobId: "job-1" });
        withCorrelation({ commandId: "cmd-1" }, () => {
          assert.deepEqual(correlationAttributes(), { requestId: "req-1", jobId: "job-1", commandId: "cmd-1" });
        });
      });
      assert.deepEqual(correlationAttributes(), { requestId: "req-1" });
    });
  });

  test("withCorrelation ne remplace pas un identifiant par une valeur absente", () => {
    runWithCorrelation({ requestId: "req-1", jobId: "job-1" }, () => {
      withCorrelation({ jobId: undefined, requestId: "req-2" }, () => {
        assert.deepEqual(correlationAttributes(), { requestId: "req-2", jobId: "job-1" });
      });
    });
  });

  test("runWithCorrelation imbriqué ouvre un contexte neuf sans fuir au retour", () => {
    runWithCorrelation({ requestId: "req-1", actorId: "acteur-1" }, () => {
      runWithCorrelation({ jobId: "job-1" }, () => {
        assert.deepEqual(correlationAttributes(), { jobId: "job-1" });
      });
      assert.deepEqual(correlationAttributes(), { requestId: "req-1", actorId: "acteur-1" });
    });
    assert.deepEqual(correlationAttributes(), {});
  });

  test("deux exécutions concurrentes ne partagent jamais leur contexte", async () => {
    const pause = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));
    const executer = (identifiant, delai) =>
      runWithCorrelation({ requestId: identifiant }, async () => {
        await pause(delai);
        const avant = correlationAttributes();
        await withCorrelation({ jobId: `job-${identifiant}` }, async () => {
          await pause(delai);
          assert.deepEqual(correlationAttributes(), { requestId: identifiant, jobId: `job-${identifiant}` });
        });
        await pause(delai);
        return { avant, apres: correlationAttributes() };
      });

    const [premier, second, troisieme] = await Promise.all([executer("req-a", 12), executer("req-b", 4), executer("req-c", 8)]);
    assert.deepEqual(premier, { avant: { requestId: "req-a" }, apres: { requestId: "req-a" } });
    assert.deepEqual(second, { avant: { requestId: "req-b" }, apres: { requestId: "req-b" } });
    assert.deepEqual(troisieme, { avant: { requestId: "req-c" }, apres: { requestId: "req-c" } });
    assert.deepEqual(correlationAttributes(), {});
  });

  // --- Pseudonymisation ----------------------------------------------------

  test("la pseudonymisation est déterministe à clé égale", () => {
    const attendu = pseudonymize("zan@example.invalid", CLE);
    assert.equal(pseudonymize("zan@example.invalid", CLE), attendu);
    assert.match(attendu, /^[0-9a-f]{64}$/);
  });

  test("deux clés différentes produisent deux pseudonymes différents", () => {
    assert.notEqual(pseudonymize("zan@example.invalid", CLE), pseudonymize("zan@example.invalid", AUTRE_CLE));
  });

  test("deux entrées différentes produisent deux pseudonymes différents", () => {
    assert.notEqual(pseudonymize("zan@example.invalid", CLE), pseudonymize("zan+2@example.invalid", CLE));
  });

  test("le pseudonyme ne contient jamais l'entrée en clair", () => {
    const entree = "zan@example.invalid";
    const pseudonyme = pseudonymizeActor(entree, environnementAvecCle);
    assert.ok(!pseudonyme.includes(entree));
    assert.ok(!pseudonyme.includes("zan"));
    assert.ok(!pseudonyme.includes("example"));
    assert.ok(!pseudonyme.toLowerCase().includes("@"));
    assert.equal(pseudonyme, pseudonymize(entree, CLE));
  });

  test("l'absence de clé lève, sans jamais retomber sur un hachage nu", () => {
    assert.throws(() => pseudonymizeActor("zan@example.invalid", {}), /OBSERVABILITY_PSEUDONYM_KEY absent/);
    assert.throws(
      () => pseudonymizeActor("zan@example.invalid", { OBSERVABILITY_PSEUDONYM_KEY: "" }),
      /OBSERVABILITY_PSEUDONYM_KEY absent/,
    );
    assert.throws(() => pseudonymize("zan@example.invalid", ""), /Clé de pseudonymisation absente/);
  });

  test("une clé trop faible ou réutilisée est refusée", () => {
    assert.throws(
      () => pseudonymizeActor("zan@example.invalid", { OBSERVABILITY_PSEUDONYM_KEY: "trop-courte" }),
      /au moins 32 caractères/,
    );
    assert.throws(
      () => pseudonymizeActor("zan@example.invalid", { OBSERVABILITY_PSEUDONYM_KEY: CLE, SUPABASE_ANON_KEY: CLE }),
      /ne peut pas réutiliser SUPABASE_ANON_KEY/,
    );
    assert.throws(
      () =>
        pseudonymizeActor("zan@example.invalid", {
          OBSERVABILITY_PSEUDONYM_KEY: CLE,
          DEFERRED_EFFECTS_WORKER_SECRET: CLE,
        }),
      /ne peut pas réutiliser DEFERRED_EFFECTS_WORKER_SECRET/,
    );
  });

  // --- Description d'erreur ------------------------------------------------

  test("describeError rend le code du fournisseur et son message, pour le serveur", () => {
    const erreur = Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    assert.deepEqual(describeError(erreur), {
      errorCode: "23505",
      errorMessage: "duplicate key value violates unique constraint",
    });
  });

  test("describeError borne le message et couvre les valeurs non-objets", () => {
    assert.equal(describeError(new Error("x".repeat(5000))).errorMessage.length, ERROR_MESSAGE_MAX_LENGTH);
    assert.deepEqual(describeError("panne"), { errorCode: UNEXPECTED_ERROR_CODE, errorMessage: "panne" });
    assert.deepEqual(describeError(undefined), { errorCode: UNEXPECTED_ERROR_CODE, errorMessage: "undefined" });
    assert.equal(describeError({}).errorCode, UNEXPECTED_ERROR_CODE);
  });

  test("describeError ne lève jamais, même sur un accesseur piégé", () => {
    const piege = new Proxy(
      {},
      {
        get() {
          throw new Error("accesseur piégé");
        },
      },
    );
    const decrit = describeError(piege);
    assert.equal(decrit.errorCode, UNEXPECTED_ERROR_CODE);
    assert.equal(typeof decrit.errorMessage, "string");
  });

  // --- Erreurs stables -----------------------------------------------------

  test("toStableError ne laisse passer ni le texte ni l'identifiant du fournisseur", () => {
    const erreur = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key" (zan@example.invalid)'),
      { code: "23505", detail: "postgresql://postgres:secret@127.0.0.1:54322/postgres" },
    );
    const stable = toStableError(erreur, "conflit");
    assert.deepEqual(Object.keys(stable), ["code", "message"]);
    assert.equal(stable.code, "conflit");
    assert.ok(!stable.message.includes("23505"));
    assert.ok(!stable.message.includes("duplicate"));
    assert.ok(!stable.message.includes("users_email_key"));
    assert.ok(!stable.message.includes("zan@example.invalid"));
    assert.ok(!stable.message.includes("postgresql://"));
  });

  test("toStableError applique un code et un message par défaut", () => {
    const stable = toStableError(new Error("panne fournisseur"));
    assert.equal(stable.code, DEFAULT_STABLE_ERROR_CODE);
    assert.ok(stable.message.length > 0);
    assert.ok(!stable.message.includes("panne fournisseur"));
    assert.equal(toStableError(null, "code_inconnu_du_catalogue").message, stable.message);
  });

  test("toStableError ne reprend le contenu que d'une erreur explicitement déclarée stable", () => {
    const erreur = Object.assign(new Error("interne"), {
      stableError: {
        code: "requete_invalide",
        message: "Le titre est requis.",
        fieldErrors: { titre: "requis", interne: { sql: "select 1" } },
        conflict: { version: 2 },
      },
    });
    const stable = toStableError(erreur, "erreur_inattendue");
    assert.equal(stable.code, "requete_invalide");
    assert.equal(stable.message, "Le titre est requis.");
    assert.deepEqual(stable.fieldErrors, { titre: "requis" });
    assert.deepEqual(stable.conflict, { version: 2 });
  });

  test("toStableError ne lève jamais et n'invente pas de champs", () => {
    const piege = new Proxy(
      {},
      {
        get() {
          throw new Error("accesseur piégé");
        },
      },
    );
    const stable = toStableError(piege, "execution_echouee");
    assert.equal(stable.code, "execution_echouee");
    assert.equal(stable.fieldErrors, undefined);
    assert.equal(stable.conflict, undefined);
  });

  // --- Logger : liste blanche ----------------------------------------------

  test("le logger fusionne la corrélation et détruit tout champ inconnu", () => {
    const ligne = runWithCorrelation({ requestId: "req-1", jobId: "job-1" }, () =>
      formatLogLine("error", "échec de traitement", {
        errorCode: "23505",
        queue: "deferred_effects",
        payload: { titre: "Berserk", email: "zan@example.invalid" },
        title: "Berserk",
        stack: "at file:///secret",
      }),
    );
    const evenement = JSON.parse(ligne);
    assert.equal(evenement.level, "error");
    assert.equal(evenement.message, "échec de traitement");
    assert.match(evenement.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(Object.keys(evenement), ["level", "message", "timestamp", "requestId", "jobId", "errorCode", "queue"]);
    assert.ok(!ligne.includes("Berserk"));
    assert.ok(!ligne.includes("zan@example.invalid"));
  });

  test("une clé autorisée portant autre chose qu'un scalaire est détruite", () => {
    const evenement = JSON.parse(
      formatLogLine("warn", "message", {
        errorMessage: { titre: "Berserk" },
        msgId: [1, 2, 3],
        durationMs: Number.NaN,
        count: "beaucoup",
        skipped: "oui",
      }),
    );
    assert.deepEqual(Object.keys(evenement), ["level", "message", "timestamp"]);
  });

  test("le logger produit une ligne JSON valide sous le plafond Vercel", () => {
    const ligne = formatLogLine("info", "trop long ".repeat(40_000), { errorMessage: "détail ".repeat(20_000) });
    assert.ok(Buffer.byteLength(ligne, "utf8") <= LOG_LINE_MAX_BYTES);
    assert.equal(ligne.includes("\n"), false);
    const evenement = JSON.parse(ligne);
    assert.equal(evenement.level, "info");
    assert.equal(typeof evenement.message, "string");
  });
}
