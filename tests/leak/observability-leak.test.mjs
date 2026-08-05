import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * TEST DE FUITE — story 1.4 (AC 3 ; AD-12, NFR-7, NFR-8).
 *
 * Porte CI dédiée (`npm run ci:leak`), séparée des tests unitaires : elle ne vérifie pas
 * un comportement, elle interdit un résultat. On soumet au socle d'observabilité un jeu
 * d'entrées HOSTILES — adresse électronique, titre de manga, contenu importé, URL signée
 * de média, secret du worker, chaîne de connexion Postgres, JWT — et le fichier échoue si
 * l'une d'elles ressort, dans quelque forme que ce soit (brute, échappée JSON, encodée
 * URL, encodée base64), de la ligne de journal produite.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * PAR OÙ LES FUITES ARRIVENT RÉELLEMENT
 * ────────────────────────────────────────────────────────────────────────────────
 * Pas par `logger.info("titre", { title })` — celui-là, tout le monde le voit en revue.
 * Les chemins couverts ici sont les chemins INDIRECTS : un objet imbriqué passé en champ,
 * le `payload` complet d'une enveloppe d'effet différé, une erreur dont la STACK porte une
 * chaîne de connexion, une valeur hostile glissée dans un champ pourtant AUTORISÉ par la
 * liste blanche (`errorMessage` est le cas type), le `message` lui-même qui est du texte
 * libre, et enfin la troncature — qui re-sérialise, donc pourrait ressusciter un fragment.
 *
 * Point d'entrée : `formatLogLine`, qui construit la ligne SANS l'écrire. Aucune capture
 * de `console`, donc aucun test qui dépend d'un espion global.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE PEUT PAS PROUVER — à lire avant d'y ajouter une assertion
 * ────────────────────────────────────────────────────────────────────────────────
 * 1. La garantie est la LISTE BLANCHE sur les clés ; l'expurgation par motifs n'est qu'un
 *    filet. Un titre de manga glissé dans le `message` libre ou dans `errorMessage` n'est
 *    reconnu par aucun motif et RESSORTIRAIT. C'est pourquoi le titre et le contenu
 *    importé ne sont exercés ici que par des chemins de CHAMPS, et pourquoi la règle
 *    « `message` est un littéral statique » n'est pas négociable. Aucune assertion ne
 *    peut la remplacer.
 * 2. Les champs de corrélation (`requestId`, `commandId`, `actorId`, `jobId`) échappent
 *    délibérément à l'expurgation : ce sont des UUID et des pseudonymes HMAC que nous
 *    produisons. Un appelant qui y logerait une adresse en clair fuiterait ; la parade est
 *    `pseudonymizeActor`, exercée plus bas, pas une expurgation qui effacerait la
 *    corrélation que la story livre.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * CLÉ DE PSEUDONYMISATION : FABRIQUÉE ICI
 * ────────────────────────────────────────────────────────────────────────────────
 * `OBSERVABILITY_PSEUDONYM_KEY` est passée explicitement à `pseudonymizeActor` depuis une
 * constante de ce fichier, jamais lue depuis l'environnement. Une clé de test n'a aucune
 * raison de devenir un secret de workflow : la CI n'a donc RIEN à déclarer pour cette porte.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POINT DUR : test en .mjs, socle en TypeScript, deux versions de Node
 * ────────────────────────────────────────────────────────────────────────────────
 * Même remède que `tests/unit/observability.test.mjs` : l'effacement de types natif est
 * actif par défaut sur la CI (Node 24.18.0) mais demande `--experimental-strip-types` sur
 * Node 22.15.1. On tente l'import puis, sur `ERR_UNKNOWN_FILE_EXTENSION`, on se relance UNE
 * seule fois dans un sous-processus muni du drapeau ; une sentinelle d'environnement
 * interdit la boucle et le code de sortie du sous-processus devient celui du fichier.
 * `NODE_TEST_CONTEXT` est RETIRÉ de l'environnement du sous-processus : sans cela,
 * `node:test` détecte un lancement récursif, n'exécute AUCUN test et rend un succès en
 * trompe-l'œil — exactement le genre de porte qui ne garde rien. Le bloc `registerHooks`
 * résout `@/…`, les imports relatifs sans extension entre fichiers `.ts` et le JSON de
 * configuration importé sans attribut `with { type: "json" }`.
 */

const RACINE = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINELLE_RELANCE = "TEST_FUITE_EFFACEMENT_TYPES";

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
    LOG_LINE_MAX_BYTES,
    REDACTION_PLACEHOLDER,
    describeError,
    formatLogLine,
    pseudonymize,
    pseudonymizeActor,
    runWithCorrelation,
    toStableError,
  } = socle;

  // --- Clé de test, fabriquée ici (voir l'en-tête) --------------------------

  const CLE_PSEUDONYME = "cle-de-test-du-test-de-fuite-48-caracteres-minimum";
  const AUTRE_CLE_PSEUDONYME = "autre-cle-de-test-du-test-de-fuite-48-caracteres-x";
  assert.ok(CLE_PSEUDONYME.length >= 32, "la clé fabriquée doit satisfaire la garde d'environnement");

  // --- Entrées hostiles ----------------------------------------------------
  //
  // `fragments` porte les morceaux DISTINCTIFS de chaque valeur : une fuite partielle est
  // une fuite. Ils sont écrits dans leur casse d'origine — la comparaison abaisse la casse
  // des deux côtés, et les formes encodées sont dérivées de la casse d'origine.

  const EMAIL = "zan.kurosawa+bibliotheque@exemple-prive.test";
  const TITRE_MANGA = "Vagabond, tome 37 — relecture nocturne";
  const CONTENU_IMPORTE = "Berserk;Kentaro Miura;2024-11-03;note privée: relu après la rupture";
  const URL_SIGNEE =
    "https://abcdefghijklmno.supabase.co/storage/v1/object/sign/media/zan/vagabond-37.jpg?token=eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJtZWRpYS96YW4vdmFnYWJvbmQtMzcuanBnIn0.Kc1L9mQpZ2rT4vW6xY8aB0cD2eF4gH6iJ8kL0mN2oP4";
  const SECRET_WORKER = "9f2c7b41ae63d05f8c1e4a97b230d6e5f8a1c4b70d93e26af5108c7b3d9e0f42";
  const CHAINE_POSTGRES = "postgresql://postgres:M0tDeP4sseUltraSecret@db.abcdefghijklmno.supabase.co:5432/postgres";
  const JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ6YW4iLCJlbWFpbCI6InphbkBleGVtcGxlLnRlc3QifQ.7Qb2mR9tX1yZ3aC5eG7iK9lN1pS3uW5xZ7bD9fH1jL3";

  const HOSTILE = {
    email: { nom: "adresse électronique", fragments: [EMAIL, "zan.kurosawa", "exemple-prive.test"] },
    titre: { nom: "titre de manga", fragments: [TITRE_MANGA, "Vagabond", "relecture nocturne"] },
    contenu: { nom: "contenu importé", fragments: [CONTENU_IMPORTE, "Berserk", "Kentaro Miura", "relu après la rupture"] },
    urlSignee: {
      nom: "URL signée de média",
      fragments: [URL_SIGNEE, "storage/v1/object/sign", "abcdefghijklmno.supabase.co", "token=ey"],
    },
    secretWorker: { nom: "secret du worker", fragments: [SECRET_WORKER, "9f2c7b41ae63d05f"] },
    postgres: { nom: "chaîne de connexion Postgres", fragments: [CHAINE_POSTGRES, "postgresql://", "M0tDeP4sseUltraSecret"] },
    jwt: { nom: "JWT", fragments: [JWT, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJzdWIiOiJ6YW4"] },
  };

  const TOUS_LES_HOSTILES = Object.values(HOSTILE);
  const MOTIFS_EXPURGES = [HOSTILE.email, HOSTILE.urlSignee, HOSTILE.secretWorker, HOSTILE.postgres, HOSTILE.jwt];

  // --- Outillage d'assertion ------------------------------------------------

  /** Les formes sous lesquelles un fragment pourrait survivre à une sérialisation. */
  const formes = (fragment) => {
    const candidates = [
      fragment,
      JSON.stringify(fragment).slice(1, -1),
      encodeURIComponent(fragment),
      Buffer.from(fragment, "utf8").toString("base64"),
    ];
    return [...new Set(candidates.map((forme) => forme.toLowerCase()))];
  };

  /** Échoue dès qu'un fragment hostile apparaît dans la sortie, sous quelque forme que ce soit. */
  const aucuneFuite = (etiquette, sortie, interdits) => {
    assert.equal(typeof sortie, "string", `${etiquette} : la sortie doit être une chaîne`);
    const cible = sortie.toLowerCase();
    for (const { nom, fragments } of interdits) {
      for (const fragment of fragments) {
        for (const forme of formes(fragment)) {
          assert.ok(
            !cible.includes(forme),
            `${etiquette} — FUITE : ${nom} ressort sous la forme « ${forme.slice(0, 60)} »\nsortie : ${sortie.slice(0, 400)}`,
          );
        }
      }
    }
  };

  /** Une ligne vide passerait tout test de fuite : on vérifie qu'elle reste exploitable. */
  const ligneExploitable = (etiquette, ligne) => {
    const objet = JSON.parse(ligne);
    assert.ok(objet.level, `${etiquette} : niveau absent`);
    assert.equal(typeof objet.message, "string", `${etiquette} : message absent`);
    assert.match(objet.timestamp, /^\d{4}-\d{2}-\d{2}T/, `${etiquette} : horodatage absent`);
    return objet;
  };

  // --- Chemin direct --------------------------------------------------------

  test("un champ absent de la liste blanche est détruit, quelle que soit sa valeur", () => {
    const ligne = formatLogLine("error", "échec de traitement", {
      title: TITRE_MANGA,
      email: EMAIL,
      url: URL_SIGNEE,
      coverUrl: URL_SIGNEE,
      workerSecret: SECRET_WORKER,
      DEFERRED_EFFECTS_WORKER_SECRET: SECRET_WORKER,
      connectionString: CHAINE_POSTGRES,
      authorization: `Bearer ${JWT}`,
      importedRow: CONTENU_IMPORTE,
      body: CONTENU_IMPORTE,
      headers: `authorization: Bearer ${JWT}`,
    });
    aucuneFuite("champ non déclaré", ligne, TOUS_LES_HOSTILES);
    const objet = ligneExploitable("champ non déclaré", ligne);
    assert.deepEqual(Object.keys(objet), ["level", "message", "timestamp"]);
  });

  // --- Chemins indirects ----------------------------------------------------

  test("un objet imbriqué glissé sous une clé autorisée est détruit avec son contenu", () => {
    const ligne = formatLogLine("error", "échec de traitement", {
      errorCode: { payload: { title: TITRE_MANGA, email: EMAIL } },
      errorMessage: { toString: () => `${EMAIL} ${CHAINE_POSTGRES}` },
      operation: [CONTENU_IMPORTE, URL_SIGNEE],
      queue: new Map([["jwt", JWT]]),
      reason: Object.assign(Object.create(null), { secret: SECRET_WORKER }),
    });
    aucuneFuite("objet imbriqué", ligne, TOUS_LES_HOSTILES);
    const objet = ligneExploitable("objet imbriqué", ligne);
    assert.deepEqual(Object.keys(objet), ["level", "message", "timestamp"]);
  });

  test("l'enveloppe d'un effet différé ne laisse passer que ses identifiants", () => {
    const ligne = formatLogLine("info", "effet différé consommé", {
      messageId: "0198c3f2-5b7a-7e31-9d2c-4f6a8b1e0c37",
      msgId: 4711,
      eventType: "library.book.added",
      queue: "deferred_effects",
      worker: "deferred-effects",
      attempt: 2,
      payload: {
        title: TITRE_MANGA,
        importedContent: CONTENU_IMPORTE,
        coverUrl: URL_SIGNEE,
        actorEmail: EMAIL,
        connection: CHAINE_POSTGRES,
        accessToken: JWT,
      },
      message: { title: TITRE_MANGA },
    });
    aucuneFuite("enveloppe d'effet différé", ligne, TOUS_LES_HOSTILES);
    const objet = ligneExploitable("enveloppe d'effet différé", ligne);
    assert.equal(objet.messageId, "0198c3f2-5b7a-7e31-9d2c-4f6a8b1e0c37");
    assert.equal(objet.msgId, 4711);
    assert.equal(objet.eventType, "library.book.added");
    assert.equal(objet.attempt, 2);
    assert.ok(!("payload" in objet), "le payload ne doit pas survivre");
  });

  test("une valeur hostile glissée dans un champ autorisé est expurgée", () => {
    const ligne = formatLogLine("error", "échec de traitement", {
      errorCode: "ECONNREFUSED",
      errorMessage: `connect ECONNREFUSED ${CHAINE_POSTGRES}`,
      reason: `jeton refusé: ${JWT}`,
      outcome: `média inaccessible: ${URL_SIGNEE}`,
      operation: `notification vers ${EMAIL}`,
      worker: `secret ${SECRET_WORKER} rejeté`,
    });
    aucuneFuite("champ autorisé", ligne, MOTIFS_EXPURGES);
    const objet = ligneExploitable("champ autorisé", ligne);
    assert.equal(objet.errorCode, "ECONNREFUSED");
    for (const cle of ["errorMessage", "reason", "outcome", "operation", "worker"]) {
      assert.ok(
        String(objet[cle]).includes(REDACTION_PLACEHOLDER),
        `${cle} doit porter le marqueur d'expurgation, valeur obtenue : ${objet[cle]}`,
      );
    }
  });

  test("le message, texte libre par nature, est expurgé de ses motifs à haut risque", () => {
    const ligne = formatLogLine(
      "error",
      `échec pour ${EMAIL} sur ${URL_SIGNEE} via ${CHAINE_POSTGRES} avec ${JWT} et le secret ${SECRET_WORKER}`,
    );
    aucuneFuite("message libre", ligne, MOTIFS_EXPURGES);
    const objet = ligneExploitable("message libre", ligne);
    assert.ok(objet.message.includes(REDACTION_PLACEHOLDER), `message obtenu : ${objet.message}`);
  });

  test("une erreur dont la stack porte un secret ne le fait franchir ni le journal ni la frontière HTTP", () => {
    const erreur = new Error(`connect ECONNREFUSED ${CHAINE_POSTGRES}`);
    erreur.code = "ECONNREFUSED";
    erreur.stack = [
      `Error: connect ECONNREFUSED ${CHAINE_POSTGRES}`,
      "    at Connection.connect (/app/node_modules/pg/lib/connection.js:1:1)",
      `    at telecharger (/app/src/media.ts:12:5) [${URL_SIGNEE}]`,
      `    at authentifier (/app/src/auth.ts:3:1) [${JWT}]`,
      `    at demarrer (/app/src/worker.ts:1:1) [${SECRET_WORKER}]`,
    ].join("\n");

    const journalise = formatLogLine("error", "connexion à la base refusée", {
      ...describeError(erreur),
      stack: erreur.stack,
      error: erreur,
      cause: { stack: erreur.stack },
    });
    aucuneFuite("stack en champ", journalise, MOTIFS_EXPURGES);
    const objet = ligneExploitable("stack en champ", journalise);
    assert.equal(objet.errorCode, "ECONNREFUSED");
    assert.ok(!("stack" in objet), "la stack ne doit jamais être retenue");

    // L'appelant maladroit qui range la stack entière dans le champ autorisé.
    const maladroit = formatLogLine("error", "connexion à la base refusée", { errorMessage: erreur.stack });
    aucuneFuite("stack en errorMessage", maladroit, MOTIFS_EXPURGES);

    // Frontière HTTP : rien de l'erreur d'origine ne doit franchir `toStableError`.
    const stable = JSON.stringify(toStableError(erreur, "execution_echouee"));
    aucuneFuite("frontière HTTP", stable, TOUS_LES_HOSTILES);
    assert.equal(JSON.parse(stable).code, "execution_echouee");
  });

  test("la troncature ne ressuscite aucun fragment hostile", () => {
    // Remplissage AVEC séparateurs, délibérément. Les motifs d'expurgation sont ancrés sur
    // des classes gourmandes (`[\w.-]+@`, `\S+`) : une chaîne de 300 000 caractères SANS
    // séparateur les fait rétrograder quadratiquement — 72 secondes pour cette seule
    // assertion, mesurées. Ce qu'on veut prouver ici est la troncature, pas la résistance
    // du moteur de regex ; le coût de ce chemin est reporté au socle, pas à la porte.
    const volumineux = `${"journal volumineux ".repeat(15_000)} ${EMAIL} ${CHAINE_POSTGRES} ${JWT}`;
    const ligne = formatLogLine("error", "charge journalisée hors norme", { errorMessage: volumineux });
    aucuneFuite("troncature", ligne, MOTIFS_EXPURGES);
    ligneExploitable("troncature", ligne);
    assert.ok(
      Buffer.byteLength(ligne, "utf8") <= LOG_LINE_MAX_BYTES,
      `la ligne doit rester sous ${LOG_LINE_MAX_BYTES} octets, obtenu ${Buffer.byteLength(ligne, "utf8")}`,
    );
  });

  // --- Corrélation : l'acteur n'entre que pseudonymisé ----------------------

  test("l'acteur journalisé est un pseudonyme HMAC, jamais l'adresse d'origine", () => {
    const pseudonyme = pseudonymizeActor(EMAIL, { OBSERVABILITY_PSEUDONYM_KEY: CLE_PSEUDONYME });
    assert.match(pseudonyme, /^[0-9a-f]{64}$/);
    aucuneFuite("pseudonyme", pseudonyme, [HOSTILE.email]);
    assert.equal(pseudonyme, pseudonymize(EMAIL, CLE_PSEUDONYME), "même entrée et même clé ⇒ même sortie");
    assert.notEqual(pseudonyme, pseudonymize(EMAIL, AUTRE_CLE_PSEUDONYME), "clés différentes ⇒ sorties différentes");

    const ligne = runWithCorrelation(
      { requestId: "0198c3f2-5b7a-7e31-9d2c-4f6a8b1e0c37", commandId: "0198c3f2-5b7a-7e31-9d2c-4f6a8b1e0c38", actorId: pseudonyme },
      () => formatLogLine("info", "commande acceptée", { operation: "library.book.add", durationMs: 12 }),
    );
    aucuneFuite("ligne corrélée", ligne, TOUS_LES_HOSTILES);
    const objet = ligneExploitable("ligne corrélée", ligne);
    assert.equal(objet.actorId, pseudonyme, "la corrélation par acteur doit survivre à l'expurgation");
    assert.equal(objet.requestId, "0198c3f2-5b7a-7e31-9d2c-4f6a8b1e0c37");
  });
}
