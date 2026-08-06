import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Tests unitaires de la transaction authentifiée — story 1.6 (AC 2, AC 4 ; AD-3, AD-10).
 *
 * Aucune base, aucune I/O, aucun réseau. Ce qui est prouvé ici est ce qu'un test contre une
 * base réelle prouverait mal : la PORTÉE des réglages. Une base réelle dirait « le rôle est
 * `authenticated` pendant la transaction » ; elle ne dirait rien de l'état dans lequel le
 * client repart vers le Pool, parce que `pg` ne rend pas ce client observable après
 * `release()`. On modélise donc la sémantique PostgreSQL — `set local` et
 * `set_config(..., true)` annulés par la fin de transaction, `set role` et
 * `set_config(..., false)` survivant à celle-ci — et l'on inspecte le client APRÈS son
 * retour au Pool. Un code qui emploierait les formes de session ferait échouer ces tests.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POINT DUR : test en .mjs, socle en TypeScript, deux versions de Node
 * ────────────────────────────────────────────────────────────────────────────────
 * Même remède que `tests/unit/observability.test.mjs` : import direct, puis relance UNIQUE
 * dans un sous-processus muni de `--experimental-strip-types` sur `ERR_UNKNOWN_FILE_EXTENSION`,
 * sentinelle d'environnement contre la boucle, et `NODE_TEST_CONTEXT` RETIRÉ du
 * sous-processus — sans quoi `node:test` détecte un lancement récursif, n'exécute AUCUN test
 * et rend un succès en trompe-l'œil. Le bloc `registerHooks` résout `@/…`, les imports
 * relatifs sans extension entre fichiers `.ts`, et le JSON de configuration.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * SUBSTITUTION DE `pg`
 * ────────────────────────────────────────────────────────────────────────────────
 * Le hook `resolve` détourne le spécificateur `pg` vers un module factice servi par le hook
 * `load`. Le chemin de production reste intact — `authenticatedTransaction` appelle bien le
 * vrai `getDatabasePool()`, qui lit bien `DATABASE_URL` — mais le Pool construit est le
 * nôtre. Aucun paramètre d'injection n'est donc ajouté à la signature imposée par la story.
 */

const RACINE = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINELLE_RELANCE = "TESTS_UNITAIRES_EFFACEMENT_TYPES";
const URL_FAUX_PG = "faux-pg:/pg";

// `getDatabasePool()` valide cette chaîne pour de bon : forme `postgresql://` et absence de
// marqueur de production. Le port est volontairement inatteignable — rien ne s'y connecte,
// le Pool étant factice.
process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:1/postgres";

/**
 * Module `pg` factice. Il modélise, aussi fidèlement que nécessaire, la sémantique de portée
 * de PostgreSQL :
 *   - `begin` ouvre la transaction ; `commit`/`rollback` la ferment ET annulent tout ce qui
 *     a été posé en portée locale ;
 *   - `set local role …` n'a d'effet que dans une transaction, et disparaît avec elle ;
 *   - `set role …` modifie la SESSION et survit donc au retour du client au Pool ;
 *   - `set_config(nom, valeur, true)` est local à la transaction, `false` ne l'est pas.
 * C'est exactement la distinction que la story désigne comme le piège central.
 */
const SOURCE_FAUX_PG = String.raw`
const journal = { pools: [], clients: [], prochainEchec: undefined };
globalThis.__fauxPg = journal;

class FauxClient {
  constructor() {
    this.requetes = [];
    this.rendu = false;
    this.detruit = false;
    this.dansTransaction = false;
    this.roleSession = "postgres";
    this.roleTransaction = undefined;
    this.reglagesSession = Object.create(null);
    this.reglagesTransaction = Object.create(null);
  }

  roleCourant() {
    return this.roleTransaction ?? this.roleSession;
  }

  reglage(nom) {
    if (Object.prototype.hasOwnProperty.call(this.reglagesTransaction, nom)) return this.reglagesTransaction[nom];
    if (Object.prototype.hasOwnProperty.call(this.reglagesSession, nom)) return this.reglagesSession[nom];
    return undefined;
  }

  async query(texte, valeurs) {
    const sql = String(texte).trim().toLowerCase();
    this.requetes.push({ sql, valeurs });

    if (journal.prochainEchec && journal.prochainEchec.sql === sql) {
      const message = journal.prochainEchec.message;
      journal.prochainEchec = undefined;
      throw new Error(message);
    }

    if (sql === "begin") {
      this.dansTransaction = true;
      return { rows: [], rowCount: 0 };
    }

    if (sql === "commit" || sql === "rollback") {
      this.dansTransaction = false;
      this.roleTransaction = undefined;
      this.reglagesTransaction = Object.create(null);
      return { rows: [], rowCount: 0 };
    }

    const roleLocal = /^set\s+local\s+role\s+([a-z_][a-z0-9_]*)$/.exec(sql);
    if (roleLocal) {
      if (this.dansTransaction) this.roleTransaction = roleLocal[1];
      return { rows: [], rowCount: 0 };
    }

    const roleDeSession = /^set\s+role\s+([a-z_][a-z0-9_]*)$/.exec(sql);
    if (roleDeSession) {
      this.roleSession = roleDeSession[1];
      return { rows: [], rowCount: 0 };
    }

    const config = /^select\s+set_config\('([^']*)',\s*(\$1|'[^']*'),\s*(true|false)\)$/.exec(sql);
    if (config) {
      const nom = config[1];
      const valeur = config[2] === "$1" ? (valeurs ? valeurs[0] : undefined) : config[2].slice(1, -1);
      if (config[3] === "true" && this.dansTransaction) this.reglagesTransaction[nom] = valeur;
      else this.reglagesSession[nom] = valeur;
      return { rows: [{ set_config: valeur }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  release(erreur) {
    this.rendu = true;
    if (erreur) this.detruit = true;
  }
}

class FauxPool {
  constructor(options) {
    this.options = options;
    journal.pools.push(this);
  }

  async connect() {
    const client = new FauxClient();
    journal.clients.push(client);
    return client;
  }

  async end() {}
}

export const Pool = FauxPool;
export default { Pool: FauxPool };
`;

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
    if (specificateur === "pg") return { url: URL_FAUX_PG, format: "module", shortCircuit: true };
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
    if (url === URL_FAUX_PG) return { format: "module", shortCircuit: true, source: SOURCE_FAUX_PG };
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

let noyau = null;
try {
  noyau = await import(pathToFileURL(resolvePath(RACINE, "src/shared/kernel/index.ts")).href);
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

if (noyau) {
  const { authenticatedTransaction } = noyau;
  const journal = globalThis.__fauxPg;

  const ZAN = "11111111-1111-1111-1111-111111111111";
  const CLAIM = "request.jwt.claim.sub";
  const DELAI_REQUETE = "set local statement_timeout = '10s'";
  const SEQUENCE_ATTENDUE = [
    "begin",
    DELAI_REQUETE,
    "set local role authenticated",
    "select set_config('request.jwt.claim.sub', $1, true)",
  ];

  const executer = async (identifiant = ZAN, travail = async () => "resultat") => {
    let client;
    const valeur = await authenticatedTransaction(identifiant, async (emprunte) => {
      client = emprunte;
      return travail(emprunte);
    });
    return { client, valeur };
  };

  // --- Le rôle et le claim sont bien posés ---------------------------------

  test("le module factice est bien celui qui construit le Pool", () => {
    assert.ok(journal, "le module `pg` factice doit être chargé à la place du vrai");
  });

  test("la transaction pose le rôle authenticated et le sujet du jeton", async () => {
    let observe;
    const { valeur } = await executer(ZAN, async (client) => {
      observe = {
        dansTransaction: client.dansTransaction,
        role: client.roleCourant(),
        sub: client.reglage(CLAIM),
      };
      return "resultat";
    });
    assert.equal(valeur, "resultat");
    assert.deepEqual(observe, { dansTransaction: true, role: "authenticated", sub: ZAN });
  });

  test("le begin précède le set local, sans quoi celui-ci serait sans effet", async () => {
    const { client } = await executer();
    assert.deepEqual(
      client.requetes.map((requete) => requete.sql),
      [...SEQUENCE_ATTENDUE, "commit"],
    );
  });

  test("la transaction borne localement les requêtes à 10 secondes avant tout travail", async () => {
    let requetesAvantTravail;
    const { client } = await executer(ZAN, async (emprunte) => {
      requetesAvantTravail = [...emprunte.requetes];
      return null;
    });

    assert.equal(requetesAvantTravail[0].sql, "begin");
    assert.deepEqual(requetesAvantTravail[1], { sql: DELAI_REQUETE, valeurs: undefined });
    assert.deepEqual(
      requetesAvantTravail.map((requete) => requete.sql),
      SEQUENCE_ATTENDUE,
      "le délai doit être posé après BEGIN et avant le rôle, le claim et le callback",
    );
    assert.equal(
      client.requetes.filter((requete) => requete.sql.includes("statement_timeout")).length,
      1,
      "une seule limite constante doit être appliquée par transaction",
    );
    assert.ok(
      !client.requetes.some((requete) => /^set\s+statement_timeout\b/.test(requete.sql)),
      "le délai ne doit jamais être posé en portée de session",
    );
  });

  test("le sujet du jeton est un paramètre lié, jamais concaténé au SQL", async () => {
    const { client } = await executer();
    const pose = client.requetes.find((requete) => requete.sql.includes("set_config"));
    assert.deepEqual(pose.valeurs, [ZAN]);
    assert.ok(!pose.sql.includes(ZAN), "l'identifiant ne doit apparaître nulle part dans le texte SQL");
  });

  test("aucune forme de portée SESSION n'est émise", async () => {
    const { client } = await executer();
    for (const { sql } of client.requetes) {
      assert.ok(!/^set\s+role\b/.test(sql), `\`${sql}\` poserait le rôle en portée de session`);
      assert.ok(!/set_config\([^)]*,\s*false\)/.test(sql), `\`${sql}\` poserait le claim en portée de session`);
    }
  });

  // --- …et ils retombent au retour du client au Pool -----------------------

  test("après le commit, le client rendu au Pool n'a plus ni rôle ni claim", async () => {
    const { client } = await executer();
    assert.equal(client.rendu, true, "le client doit toujours être rendu au Pool");
    assert.equal(client.detruit, false, "un chemin nominal ne doit pas détruire la connexion");
    assert.equal(client.dansTransaction, false);
    assert.equal(client.roleCourant(), "postgres", "le rôle doit être retombé au rôle de session");
    assert.equal(client.reglage(CLAIM), undefined, "le claim ne doit pas survivre à la transaction");
  });

  test("deux transactions successives ne se contaminent pas par le Pool", async () => {
    const AUTRE = "22222222-2222-2222-2222-222222222222";
    const { client: premier } = await executer(ZAN);
    let vuParLeSecond;
    const { client: second } = await executer(AUTRE, async (client) => {
      vuParLeSecond = client.reglage(CLAIM);
      return null;
    });
    assert.notEqual(premier, second, "le Pool factice doit prêter un client neuf par transaction");
    assert.equal(vuParLeSecond, AUTRE);
    assert.equal(premier.reglage(CLAIM), undefined);
    assert.equal(second.reglage(CLAIM), undefined);
  });

  // --- Annulation ----------------------------------------------------------

  test("une erreur de l'unité de travail déclenche ROLLBACK et se propage", async () => {
    let client;
    await assert.rejects(
      authenticatedTransaction(ZAN, async (emprunte) => {
        client = emprunte;
        throw new Error("panne applicative");
      }),
      /panne applicative/,
    );
    const sequence = client.requetes.map((requete) => requete.sql);
    assert.deepEqual(sequence, [...SEQUENCE_ATTENDUE, "rollback"]);
    assert.ok(!sequence.includes("commit"), "aucun commit ne doit être émis après une faute");
    assert.equal(client.rendu, true);
    assert.equal(client.detruit, false);
    assert.equal(client.roleCourant(), "postgres");
    assert.equal(client.reglage(CLAIM), undefined);
  });

  test("un ROLLBACK impossible détruit la connexion au lieu de la rendre au Pool", async () => {
    journal.prochainEchec = { sql: "rollback", message: "connexion perdue" };
    const erreursJournalisees = [];
    const original = console.error;
    console.error = (ligne) => erreursJournalisees.push(ligne);
    let client;
    try {
      await assert.rejects(
        authenticatedTransaction(ZAN, async (emprunte) => {
          client = emprunte;
          throw new Error("panne applicative");
        }),
        /panne applicative/,
        "l'erreur d'origine doit primer sur celle de l'annulation",
      );
    } finally {
      console.error = original;
      journal.prochainEchec = undefined;
    }
    assert.equal(client.rendu, true);
    assert.equal(client.detruit, true, "un client d'état inconnu ne doit jamais retourner au Pool");
    assert.equal(erreursJournalisees.length, 1, "l'incident doit être journalisé, une seule fois");
    const evenement = JSON.parse(erreursJournalisees[0]);
    assert.equal(evenement.level, "error");
    assert.equal(evenement.operation, "authenticatedTransaction");
    assert.ok(!erreursJournalisees[0].includes(ZAN), "le journal ne doit porter aucun identifiant d'utilisateur");
  });

  // --- Validation de l'entrée ---------------------------------------------

  test("un identifiant non conforme est refusé avant tout emprunt au Pool", async () => {
    const avant = journal.clients.length;
    const invalides = [
      "",
      "   ",
      "pas-un-uuid",
      "11111111-1111-1111-1111-11111111111",
      "11111111-1111-1111-1111-1111111111111",
      `${ZAN} `,
      `${ZAN}'; set role postgres; --`,
      "11111111_1111_1111_1111_111111111111",
      null,
      undefined,
      42,
      {},
    ];
    for (const invalide of invalides) {
      await assert.rejects(
        () => authenticatedTransaction(invalide, async () => "jamais atteint"),
        /identifiant utilisateur invalide/,
        `« ${String(invalide)} » doit être refusé`,
      );
    }
    assert.equal(journal.clients.length, avant, "aucun client ne doit être emprunté pour une entrée refusée");
  });

  test("une unité de travail absente est refusée avant tout emprunt au Pool", async () => {
    const avant = journal.clients.length;
    await assert.rejects(() => authenticatedTransaction(ZAN, undefined), /unité de travail absente/);
    assert.equal(journal.clients.length, avant);
  });
}
