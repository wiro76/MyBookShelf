import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve as resolvePath, dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Tests unitaires du worker d'effets différés — fonctions pures et garde-fous d'options.
 *
 * Complément du canari `tests/integration/database-outbox-canary.mjs`, qui prouve le
 * comportement transactionnel mais exige Docker et une base éphémère. Ici : aucune base,
 * aucune I/O, exécution en quelques millisecondes, donc exécutable à chaque commit.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POINT DUR : test en .mjs, worker en TypeScript, deux versions de Node
 * ────────────────────────────────────────────────────────────────────────────────
 * Même contrainte que le canari, même remède. L'effacement de types natif est actif par
 * défaut sur la CI (Node 24.18.0) mais demande `--experimental-strip-types` sur Node
 * 22.15.1. Plutôt que d'ajouter un drapeau au script npm `ci:unit` — il n'existe pas sur
 * toutes les versions et son retrait ultérieur casserait le local — ce fichier tente
 * l'import puis, sur `ERR_UNKNOWN_FILE_EXTENSION`, se relance UNE seule fois dans un
 * sous-processus muni du drapeau. Une sentinelle d'environnement interdit la boucle, et
 * le code de sortie du sous-processus devient celui du fichier de test.
 *
 * Différence avec le canari : `NODE_TEST_CONTEXT` est retiré de l'environnement du
 * sous-processus. Sans cela, `node:test` détecte un lancement récursif et n'exécute
 * AUCUN test — tout en rendant un succès, c'est-à-dire le pire des résultats.
 *
 * Le worker n'a aucun import relatif à l'exécution (`node:crypto` et des `import type`
 * seulement) : aucun hook de résolution n'est nécessaire, contrairement à `route.ts`.
 */

const RACINE = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINELLE_RELANCE = "TESTS_UNITAIRES_EFFACEMENT_TYPES";

const estErreurEffacementTypes = (erreur) =>
  erreur?.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
  erreur?.code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING" ||
  /Unknown file extension "\.tsx?"/.test(String(erreur?.message ?? ""));

let worker = null;
try {
  worker = await import(pathToFileURL(resolvePath(RACINE, "src/workers/deferred-effects/index.ts")).href);
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

if (worker) {
  const {
    createJobId,
    describeError,
    isParsableTimestamp,
    parseDeferredEffectEnvelope,
    processDeferredEffects,
    replayDeadLetteredEffects,
    DeferredEffectsOptionsError,
    MAX_DURATION_MS,
    SHUTDOWN_MARGIN_MS,
    VISIBILITY_TIMEOUT_SECONDS,
  } = worker;

  const enveloppeValide = (surcharges = {}) => ({
    messageId: randomUUID(),
    eventType: "library.book.added",
    producer: "tests-unitaires",
    aggregateId: randomUUID(),
    aggregateVersion: 1,
    payloadVersion: 1,
    occurredAt: "2026-08-05T00:00:00Z",
    payload: { kind: "increment" },
    ...surcharges,
  });

  /**
   * Faux client `pg` : il expose `release`, donc le worker le traite comme un PoolClient
   * déjà emprunté et n'appelle jamais `connect()`. Chaque requête est appariée par
   * fragment de SQL, dans l'ordre de déclaration, et journalisée pour assertion.
   */
  const fauxClient = (reponses) => {
    const journal = [];
    return {
      journal,
      release() {},
      query(texte, parametres) {
        journal.push(texte);
        for (const [fragment, reponse] of reponses) {
          if (texte.includes(fragment)) {
            const resolue = typeof reponse === "function" ? reponse(parametres) : reponse;
            return Promise.resolve(resolue ?? { rows: [], rowCount: 0 });
          }
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    };
  };

  const ligneQueue = (message, msgId = "1") => ({
    msg_id: msgId,
    read_ct: 1,
    enqueued_at: "2026-08-05T00:00:00Z",
    vt: "2026-08-05T00:00:30Z",
    message,
  });

  /** Connexion qui fait échouer le test si le worker l'utilise : prouve un rejet AVANT toute I/O. */
  const connexionInterdite = () => ({
    release() {},
    query() {
      throw new Error("la validation des options doit rejeter AVANT le moindre accès base");
    },
  });

  const optionsProcess = (surcharges = {}) => ({
    connection: connexionInterdite(),
    jobId: createJobId(),
    ...surcharges,
  });

  // ── parseDeferredEffectEnvelope ────────────────────────────────────────────

  test("parseDeferredEffectEnvelope accepte une enveloppe AD-1 complète et n'en garde que les huit clés", () => {
    const brute = { ...enveloppeValide(), cleParasite: "à jeter" };
    const analysee = parseDeferredEffectEnvelope(brute);
    assert.notEqual(analysee, null);
    assert.deepEqual(Object.keys(analysee).sort(), [
      "aggregateId",
      "aggregateVersion",
      "eventType",
      "messageId",
      "occurredAt",
      "payload",
      "payloadVersion",
      "producer",
    ]);
    assert.equal(analysee.messageId, brute.messageId);
    assert.deepEqual(analysee.payload, { kind: "increment" });
  });

  test("parseDeferredEffectEnvelope accepte les variantes ISO-8601 légitimes et un payload vide", () => {
    for (const occurredAt of [
      "2026-08-05T00:00:00Z",
      "2026-08-05T00:00:00z",
      "2026-08-05T00:00:00.123Z",
      "2026-08-05T00:00:00.123456+02:00",
      "2026-08-05T00:00:00-0500",
      "2026-08-05T00:00",
      "2026-08-05 00:00:00Z",
    ]) {
      assert.notEqual(
        parseDeferredEffectEnvelope(enveloppeValide({ occurredAt })),
        null,
        `occurredAt légitime refusé : ${occurredAt}`,
      );
    }
    assert.notEqual(parseDeferredEffectEnvelope(enveloppeValide({ payload: {} })), null);
    assert.notEqual(parseDeferredEffectEnvelope(enveloppeValide({ aggregateVersion: 0 })), null);
    assert.notEqual(parseDeferredEffectEnvelope(enveloppeValide({ aggregateVersion: -1 })), null);
  });

  test("parseDeferredEffectEnvelope refuse tout ce qui n'est pas un objet JSON", () => {
    for (const brute of [null, undefined, 42, "texte", true, [], [enveloppeValide()], Symbol("x")]) {
      assert.equal(parseDeferredEffectEnvelope(brute), null, `valeur acceptée à tort : ${String(brute)}`);
    }
  });

  test("parseDeferredEffectEnvelope refuse chaque clé AD-1 absente", () => {
    for (const cle of [
      "messageId",
      "eventType",
      "producer",
      "aggregateId",
      "aggregateVersion",
      "payloadVersion",
      "occurredAt",
      "payload",
    ]) {
      const amputee = enveloppeValide();
      delete amputee[cle];
      assert.equal(parseDeferredEffectEnvelope(amputee), null, `clé absente acceptée à tort : ${cle}`);
    }
  });

  test("parseDeferredEffectEnvelope refuse un messageId qui n'est pas un UUID", () => {
    for (const messageId of ["", "pas-un-uuid", "1234", randomUUID().slice(0, -1), 42, null, {}]) {
      assert.equal(parseDeferredEffectEnvelope(enveloppeValide({ messageId })), null);
    }
  });

  test("parseDeferredEffectEnvelope refuse les identifiants textuels vides ou non textuels", () => {
    for (const cle of ["eventType", "producer", "aggregateId"]) {
      for (const valeur of ["", 42, null, {}, []]) {
        assert.equal(
          parseDeferredEffectEnvelope(enveloppeValide({ [cle]: valeur })),
          null,
          `${cle} accepté à tort : ${String(valeur)}`,
        );
      }
    }
  });

  test("parseDeferredEffectEnvelope refuse les versions non entières", () => {
    for (const cle of ["aggregateVersion", "payloadVersion"]) {
      for (const valeur of ["1", 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, {}]) {
        assert.equal(
          parseDeferredEffectEnvelope(enveloppeValide({ [cle]: valeur })),
          null,
          `${cle} accepté à tort : ${String(valeur)}`,
        );
      }
    }
  });

  // Correctif 5 : une chaîne non vide ne suffit pas, l'instant doit être analysable.
  test("parseDeferredEffectEnvelope refuse un occurredAt qui n'est pas une date analysable", () => {
    for (const occurredAt of [
      "hier",
      "demain 14h",
      "",
      "   ",
      "0",
      "2026",
      "2026-08-05",
      "05/08/2026",
      "2026-13-45T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-08-05T25:00:00Z",
      "2026-08-05T00:60:00Z",
      "Mon, 05 Aug 2026 00:00:00 GMT",
      1_775_000_000_000,
      null,
    ]) {
      assert.equal(
        parseDeferredEffectEnvelope(enveloppeValide({ occurredAt })),
        null,
        `occurredAt accepté à tort : ${String(occurredAt)}`,
      );
    }
  });

  test("isParsableTimestamp tranche entre un instant et un mot", () => {
    assert.equal(isParsableTimestamp("2026-08-05T00:00:00Z"), true);
    assert.equal(isParsableTimestamp("hier"), false);
    assert.equal(isParsableTimestamp("2026-02-30T00:00:00Z"), false);
  });

  test("parseDeferredEffectEnvelope refuse un payload qui n'est pas un objet", () => {
    for (const payload of ["", "texte", 42, true, null, [], [1, 2]]) {
      assert.equal(parseDeferredEffectEnvelope(enveloppeValide({ payload })), null);
    }
  });

  // ── createJobId ────────────────────────────────────────────────────────────

  test("createJobId produit un UUID de version 7 et de variante RFC 9562", () => {
    for (let index = 0; index < 200; index += 1) {
      const jobId = createJobId();
      assert.match(jobId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      assert.equal(jobId.length, 36);
    }
  });

  test("createJobId encode l'horodatage sur les 48 premiers bits", () => {
    const jobId = createJobId(0x0123456789ab);
    assert.equal(jobId.slice(0, 8), "01234567");
    assert.equal(jobId.slice(9, 13), "89ab");
    assert.equal(createJobId(0).slice(0, 8), "00000000");
  });

  test("createJobId est monotone : l'ordre lexicographique suit l'ordre chronologique", () => {
    const instants = [0, 1, 1_000, 1_775_000_000_000, 1_775_000_000_001, 281_474_976_710_655];
    const jobIds = instants.map((instant) => createJobId(instant));
    assert.deepEqual([...jobIds].sort(), jobIds, "les jobId doivent être triables par date");
    for (let index = 1; index < jobIds.length; index += 1) {
      assert.ok(jobIds[index] > jobIds[index - 1], `${jobIds[index]} devrait suivre ${jobIds[index - 1]}`);
    }
  });

  test("createJobId reste unique à horodatage constant", () => {
    const instant = 1_775_000_000_000;
    const jobIds = new Set(Array.from({ length: 500 }, () => createJobId(instant)));
    assert.equal(jobIds.size, 500, "les 74 bits aléatoires doivent écarter toute collision");
  });

  // ── describeError ──────────────────────────────────────────────────────────

  test("describeError extrait code et message d'une erreur ordinaire", () => {
    assert.deepEqual(describeError(new Error("panne")), {
      errorCode: "UNEXPECTED_ERROR",
      errorMessage: "panne",
    });
    assert.deepEqual(describeError(Object.assign(new Error("panne pg"), { code: "23505" })), {
      errorCode: "23505",
      errorMessage: "panne pg",
    });
    assert.equal(describeError({ code: "", message: "sans code" }).errorCode, "UNEXPECTED_ERROR");
    assert.equal(describeError({ code: 42, message: "code non textuel" }).errorCode, "UNEXPECTED_ERROR");
  });

  test("describeError tronque le message à 2000 caractères", () => {
    const decrit = describeError(new Error("x".repeat(5_000)));
    assert.equal(decrit.errorMessage.length, 2_000);
  });

  test("describeError décrit les primitives sans lever", () => {
    assert.equal(describeError(null).errorMessage, "null");
    assert.equal(describeError(undefined).errorMessage, "undefined");
    assert.equal(describeError(42).errorMessage, "42");
    assert.equal(describeError("échec brut").errorMessage, "échec brut");
    assert.equal(describeError(Symbol("jeton")).errorMessage, "Symbol(jeton)");
    for (const valeur of [null, undefined, 42, "x", Symbol("y"), true]) {
      assert.equal(describeError(valeur).errorCode, "UNEXPECTED_ERROR");
    }
  });

  /**
   * Correctif 4 : `describeError` est appelé depuis `recordFailure` HORS de tout `try`.
   * Une conversion qui lève ici tuerait l'exécution entière — et donc les compteurs de
   * tout le lot — au lieu de journaliser l'échec d'un seul message.
   */
  test("describeError survit aux erreurs exotiques dont la conversion en chaîne lève", () => {
    const sansPrototype = Object.create(null);
    const toStringPiege = {
      toString() {
        throw new Error("conversion interdite");
      },
    };
    const primitivePiegee = {
      [Symbol.toPrimitive]() {
        throw new Error("primitive interdite");
      },
    };
    const proxyTotalementPiege = new Proxy(
      {},
      {
        get() {
          throw new Error("accès interdit");
        },
        has() {
          throw new Error("accès interdit");
        },
      },
    );
    const messagePiege = {
      get message() {
        throw new Error("message interdit");
      },
      code: "CODE_LISIBLE",
    };
    const codePiege = {
      get code() {
        throw new Error("code interdit");
      },
      message: "message lisible",
    };

    for (const exotique of [
      sansPrototype,
      toStringPiege,
      primitivePiegee,
      proxyTotalementPiege,
      messagePiege,
      codePiege,
    ]) {
      let decrit;
      assert.doesNotThrow(() => {
        decrit = describeError(exotique);
      }, "describeError ne doit JAMAIS lever");
      assert.equal(typeof decrit.errorCode, "string");
      assert.equal(typeof decrit.errorMessage, "string");
      assert.ok(decrit.errorCode.length > 0);
      assert.ok(decrit.errorMessage.length > 0);
      assert.ok(decrit.errorMessage.length <= 2_000);
    }

    assert.equal(describeError(messagePiege).errorCode, "CODE_LISIBLE");
    assert.equal(describeError(codePiege).errorMessage, "message lisible");
    assert.equal(describeError(codePiege).errorCode, "UNEXPECTED_ERROR");
    assert.equal(describeError(proxyTotalementPiege).errorMessage, "[erreur indescriptible]");
  });

  // ── Correctif 1 : validation des options ───────────────────────────────────

  test("les constantes de temps respectent VT < deadline < maxDuration", () => {
    const deadlineMs = MAX_DURATION_MS - SHUTDOWN_MARGIN_MS;
    assert.ok(
      VISIBILITY_TIMEOUT_SECONDS * 1_000 < deadlineMs,
      "un message lu doit redevenir visible avant la fin de l'exécution courante",
    );
    assert.ok(deadlineMs < MAX_DURATION_MS, "la deadline doit précéder maxDuration");
    assert.equal(VISIBILITY_TIMEOUT_SECONDS, 30);
  });

  const rejets = [
    ["shutdownMarginMs égal à maxDurationMs", { maxDurationMs: 60_000, shutdownMarginMs: 60_000 }],
    ["shutdownMarginMs supérieur à maxDurationMs", { maxDurationMs: 60_000, shutdownMarginMs: 90_000 }],
    ["shutdownMarginMs négatif", { shutdownMarginMs: -1 }],
    ["maxDurationMs nul", { maxDurationMs: 0, shutdownMarginMs: 0 }],
    ["maxDurationMs négatif", { maxDurationMs: -1 }],
    ["maxDurationMs non fini", { maxDurationMs: Number.POSITIVE_INFINITY }],
    ["maxDurationMs NaN", { maxDurationMs: Number.NaN }],
    ["batchSize nul", { batchSize: 0 }],
    ["batchSize négatif", { batchSize: -10 }],
    ["batchSize décimal", { batchSize: 2.5 }],
    ["batchSize non numérique", { batchSize: "10" }],
    ["retryThreshold nul", { retryThreshold: 0 }],
    ["retryThreshold négatif", { retryThreshold: -1 }],
    ["retryThreshold décimal", { retryThreshold: 1.5 }],
    ["retryBackoffSeconds négatif", { retryBackoffSeconds: -30 }],
    ["retryBackoffSeconds décimal", { retryBackoffSeconds: 0.5 }],
    ["retryBackoffSeconds NaN", { retryBackoffSeconds: Number.NaN }],
    ["visibilityTimeoutSeconds négatif", { visibilityTimeoutSeconds: -1 }],
    ["visibilityTimeoutSeconds décimal", { visibilityTimeoutSeconds: 1.5 }],
    ["jobId vide", { jobId: "" }],
    ["jobId blanc", { jobId: "   " }],
    ["jobId absent", { jobId: undefined }],
    ["jobId non textuel", { jobId: 42 }],
    ["queue vide", { queue: "" }],
    ["deadLetterQueue vide", { deadLetterQueue: "" }],
    ["queue et DLQ confondues", { queue: "meme_file", deadLetterQueue: "meme_file" }],
    ["handler non fonction", { handler: "traiter" }],
    ["now non fonction", { now: 0 }],
    ["connexion absente", { connection: undefined }],
    ["connexion sans query", { connection: {} }],
  ];

  for (const [libelle, surcharges] of rejets) {
    test(`processDeferredEffects refuse une option incohérente : ${libelle}`, async () => {
      await assert.rejects(
        () => processDeferredEffects(optionsProcess(surcharges)),
        (erreur) => {
          assert.ok(
            erreur instanceof DeferredEffectsOptionsError,
            `attendu DeferredEffectsOptionsError, reçu ${erreur?.name}: ${erreur?.message}`,
          );
          assert.equal(erreur.code, "INVALID_WORKER_OPTIONS");
          assert.ok(erreur.message.length > 0, "le message doit désigner l'option fautive");
          return true;
        },
      );
    });
  }

  for (const [libelle, surcharges] of [
    ["batchSize nul", { batchSize: 0 }],
    ["batchSize négatif", { batchSize: -1 }],
    ["batchSize décimal", { batchSize: 1.5 }],
    ["visibilityTimeoutSeconds négatif", { visibilityTimeoutSeconds: -1 }],
    ["jobId vide", { jobId: "" }],
    ["queue vide", { queue: "" }],
    ["deadLetterQueue vide", { deadLetterQueue: "" }],
    ["queue et DLQ confondues", { queue: "meme_file", deadLetterQueue: "meme_file" }],
    ["connexion sans query", { connection: {} }],
  ]) {
    test(`replayDeadLetteredEffects refuse une option incohérente : ${libelle}`, async () => {
      await assert.rejects(
        () => replayDeadLetteredEffects({ connection: connexionInterdite(), ...surcharges }),
        (erreur) => {
          assert.ok(erreur instanceof DeferredEffectsOptionsError, `reçu ${erreur?.name}: ${erreur?.message}`);
          assert.equal(erreur.code, "INVALID_WORKER_OPTIONS");
          return true;
        },
      );
    });
  }

  test("les options nominales et les bornes légitimes sont acceptées", async () => {
    const client = fauxClient([["pg_try_advisory_lock", { rows: [{ acquired: false }] }]]);
    const resultat = await processDeferredEffects({
      connection: client,
      jobId: createJobId(),
      batchSize: 1,
      retryThreshold: 1,
      visibilityTimeoutSeconds: 0,
      retryBackoffSeconds: 0,
      maxDurationMs: 1,
      shutdownMarginMs: 0,
    });
    assert.equal(resultat.skipped, true);
    assert.equal(resultat.reason, "advisory-lock-not-acquired");
    assert.equal(resultat.hasMore, false, "aucun lot lu : hasMore ne prétend rien");
  });

  // ── Correctif 2 : hasMore ──────────────────────────────────────────────────

  const clientDeConsommation = (lignes) =>
    fauxClient([
      ["pg_try_advisory_lock", { rows: [{ acquired: true }] }],
      ["from pgmq.read", { rows: lignes }],
      ["insert into deferred.processed_messages", { rows: [], rowCount: 1 }],
      ["pg_advisory_unlock", { rows: [{ released: true }] }],
    ]);

  test("hasMore signale un lot revenu plein : une file saturée n'est plus indiscernable d'une file vide", async () => {
    const lignes = [ligneQueue(enveloppeValide(), "1"), ligneQueue(enveloppeValide(), "2")];
    const resultat = await processDeferredEffects({
      connection: clientDeConsommation(lignes),
      jobId: createJobId(),
      batchSize: 2,
    });
    assert.equal(resultat.read, 2);
    assert.equal(resultat.processed, 2);
    assert.equal(resultat.hasMore, true, "un lot plein annonce du travail restant");
    assert.equal(resultat.stoppedForTime, false);
  });

  test("hasMore reste faux sur un lot incomplet et sur une file vide", async () => {
    const partiel = await processDeferredEffects({
      connection: clientDeConsommation([ligneQueue(enveloppeValide(), "1")]),
      jobId: createJobId(),
      batchSize: 5,
    });
    assert.equal(partiel.read, 1);
    assert.equal(partiel.hasMore, false);

    const vide = await processDeferredEffects({
      connection: clientDeConsommation([]),
      jobId: createJobId(),
      batchSize: 5,
    });
    assert.equal(vide.read, 0);
    assert.equal(vide.processed, 0);
    assert.equal(vide.hasMore, false);
  });

  test("hasMore est vrai quand la deadline interrompt l'exécution", async () => {
    const instants = [0, 5_000, 5_000, 5_000];
    let appel = 0;
    const resultat = await processDeferredEffects({
      connection: clientDeConsommation([ligneQueue(enveloppeValide(), "1")]),
      jobId: createJobId(),
      maxDurationMs: 1_000,
      shutdownMarginMs: 999,
      now: () => instants[Math.min(appel++, instants.length - 1)],
    });
    assert.equal(resultat.stoppedForTime, true);
    assert.equal(resultat.hasMore, true, "un arrêt sur deadline laisse du travail derrière lui");
    assert.equal(resultat.read, 0, "la deadline dépassée interdit même la lecture du lot");
    assert.equal(resultat.durationMs, 5_000);
  });

  // ── Correctif 3 : la DLQ ne se bloque plus en tête de file ─────────────────

  test("une entrée DLQ illisible est archivée au lieu de bloquer la tête de file", async () => {
    const client = fauxClient([
      ["pg_try_advisory_lock", { rows: [{ acquired: true }] }],
      [
        "from pgmq.read",
        { rows: [ligneQueue({ pas: "une enveloppe" }, "1"), ligneQueue(enveloppeValide({ occurredAt: "hier" }), "2")] },
      ],
      ["pgmq.archive", { rows: [{ archived: true }] }],
      ["pg_advisory_unlock", { rows: [{ released: true }] }],
    ]);
    const resultat = await replayDeadLetteredEffects({ connection: client, batchSize: 5 });
    assert.equal(resultat.read, 2);
    assert.equal(resultat.discarded, 2);
    assert.equal(resultat.archived, 2, "chaque entrée illisible doit quitter la file");
    assert.equal(resultat.replayed, 0);
    assert.equal(client.journal.filter((texte) => texte.includes("pgmq.archive")).length, 2);
  });

  test("l'archivage impossible bascule sur une mise à l'écart par timeout de visibilité", async () => {
    const client = fauxClient([
      ["pg_try_advisory_lock", { rows: [{ acquired: true }] }],
      ["from pgmq.read", { rows: [ligneQueue("enveloppe corrompue", "1")] }],
      [
        "pgmq.archive",
        () => {
          throw Object.assign(new Error("table d'archive absente"), { code: "42P01" });
        },
      ],
      ["pgmq.set_vt", { rows: [{ msg_id: "1" }] }],
      ["pg_advisory_unlock", { rows: [{ released: true }] }],
    ]);
    const resultat = await replayDeadLetteredEffects({ connection: client, batchSize: 5 });
    assert.equal(resultat.discarded, 1);
    assert.equal(resultat.archived, 0);
    assert.ok(
      client.journal.some((texte) => texte.includes("pgmq.set_vt")),
      "le repli doit repousser la visibilité de l'entrée irrécupérable",
    );
  });

  test("un rejeu en échec au milieu du lot préserve la progression déjà accomplie", async () => {
    const bonne = enveloppeValide();
    const fautive = enveloppeValide();
    const suivante = enveloppeValide();
    const client = fauxClient([
      ["pg_try_advisory_lock", { rows: [{ acquired: true }] }],
      ["from pgmq.read", { rows: [ligneQueue(bonne, "1"), ligneQueue(fautive, "2"), ligneQueue(suivante, "3")] }],
      [
        "deferred.publish_effect",
        (parametres) => {
          if (String(parametres[1]).includes(fautive.messageId)) {
            throw Object.assign(new Error("publication refusée"), { code: "P0001" });
          }
          return { rows: [{ msg_id: "42" }] };
        },
      ],
      ["pg_advisory_unlock", { rows: [{ released: true }] }],
    ]);

    const resultat = await replayDeadLetteredEffects({ connection: client, batchSize: 3 });
    assert.equal(resultat.read, 3);
    assert.equal(resultat.replayed, 2, "l'échec d'un message ne doit pas annuler les autres");
    assert.equal(resultat.failed, 1);
    assert.deepEqual(resultat.messageIds, [bonne.messageId, suivante.messageId]);
    assert.equal(resultat.hasMore, true, "un lot plein annonce une DLQ non vidée");
    assert.ok(
      client.journal.some((texte) => texte.includes("ROLLBACK")),
      "le rejeu fautif doit être annulé",
    );
    assert.ok(
      client.journal.some((texte) => texte.includes("pg_advisory_unlock")),
      "le verrou doit être libéré malgré l'échec",
    );
  });
}
