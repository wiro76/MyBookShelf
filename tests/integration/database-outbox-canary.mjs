import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { setTimeout as attendre } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Canari outbox transactionnel — story 1.3, tâche T5 (AC 1 à 4).
 *
 * Il prouve PAR EXÉCUTION RÉELLE contre la base éphémère du harnais, jamais par
 * inspection de texte :
 *   (a) rollback de la mutation métier ⇒ aucun message publié ;
 *   (b) rejeu du même messageId ⇒ effet appliqué une seule fois, constaté depuis
 *       deux connexions PostgreSQL distinctes ;
 *   (c) read_ct au-delà du seuil 5 ⇒ routage DLQ portant messageId, jobId, motif
 *       et action de reprise ;
 *   (d) rejeu depuis la DLQ ⇒ message retraité avec succès ;
 *   (e) Route Handler sans header valide ⇒ 401 ;
 *   (f) lot de batchSize + 5 messages ⇒ exactement batchSize consommés, les autres
 *       redeviennent visibles après expiration du timeout de visibilité.
 *
 * Chaque exécution s'isole dans ses propres queues pgmq et son propre schéma, puis
 * nettoie tout en `finally`, y compris les lignes laissées dans les tables partagées
 * `deferred.processed_messages` et `deferred.effect_failures`.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POINT DUR : worker en TypeScript, canari en .mjs, deux versions de Node
 * ────────────────────────────────────────────────────────────────────────────────
 * Le canari importe le VRAI code de `src/` — sinon il ne prouverait rien. Deux
 * obstacles, résolus sans build ni dépendance :
 *
 * 1. L'effacement de types natif est actif par défaut sur la CI (Node 24.18.0) mais
 *    demande `--experimental-strip-types` sur Node 22.15.1. Plutôt que d'ajouter le
 *    drapeau au harnais — il n'existe pas sur toutes les versions et le retirer plus
 *    tard casserait le local — le canari tente l'import puis, sur
 *    `ERR_UNKNOWN_FILE_EXTENSION`, se relance UNE seule fois dans un sous-processus
 *    muni du drapeau. Une variable d'environnement sentinelle interdit la boucle.
 *    Le code de sortie du sous-processus devient celui du canari.
 *
 * 2. `route.ts` utilise l'alias `@/*` de tsconfig et remonte jusqu'à un
 *    `import ... from "…/environments.json"` sans attribut `with { type: "json" }`,
 *    deux choses que le résolveur ESM de Node ne sait pas faire. `module.registerHooks()`
 *    (Node ≥ 22.15 et ≥ 23.5, donc disponible ici comme en CI) fournit les deux
 *    règles manquantes en une vingtaine de lignes : résolution de `@/…`, des imports
 *    relatifs sans extension entre fichiers `.ts`, et lecture du JSON de configuration.
 *    Aucun transpileur, aucun loader tiers, rien à installer.
 */

const RACINE = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINELLE_RELANCE = "CANARI_OUTBOX_EFFACEMENT_TYPES";

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

const importerSource = (relative) => import(pathToFileURL(resolvePath(RACINE, relative)).href);

const estErreurEffacementTypes = (erreur) =>
  erreur?.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
  erreur?.code === "ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING" ||
  /Unknown file extension "\.tsx?"/.test(String(erreur?.message ?? ""));

let worker = null;
let routeHandler = null;
let noyau = null;
try {
  worker = await importerSource("src/workers/deferred-effects/index.ts");
  routeHandler = await importerSource("src/app/api/deferred-effects/process/route.ts");
  noyau = await importerSource("src/shared/kernel/index.ts");
} catch (erreur) {
  if (process.env[SENTINELLE_RELANCE] || !estErreurEffacementTypes(erreur)) throw erreur;
  const relance = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: { ...process.env, [SENTINELLE_RELANCE]: "1" },
  });
  process.exitCode = relance.status ?? 1;
}

if (worker) {
  try {
    await executerCanari();
  } catch (erreur) {
    console.error(erreur instanceof Error ? (erreur.stack ?? erreur.message) : erreur);
    process.exitCode = 1;
  }
}

async function executerCanari() {
  for (const variable of ["TEST_DATABASE_URL", "DATABASE_URL", "DEFERRED_EFFECTS_WORKER_SECRET"]) {
    if (!process.env[variable]) throw new Error(`${variable} est obligatoire`);
  }

  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 4 });

  const suffixe = randomUUID().replaceAll("-", "").slice(0, 16);
  const schema = `ci_outbox_${suffixe}`;
  const queue = `ci_outbox_${suffixe}`;
  const deadLetterQueue = `ci_outbox_${suffixe}_dlq`;
  const messageIds = [];

  const enveloppe = () => {
    const construite = {
      messageId: randomUUID(),
      eventType: "ci.outbox.effect.requested",
      producer: "ci-outbox-canary",
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      payloadVersion: 1,
      occurredAt: new Date().toISOString(),
      payload: { kind: "increment" },
    };
    messageIds.push(construite.messageId);
    return construite;
  };

  // Publication par la VRAIE fonction SQL du contrat AD-1, jamais par un pgmq.send() nu.
  const publier = async (executeur, message) =>
    (await executeur.query("select deferred.publish_effect($1, $2::jsonb) as msg_id", [queue, JSON.stringify(message)]))
      .rows[0].msg_id;

  const profondeur = async (executeur, nom) =>
    (await executeur.query(`select count(*)::int as total from pgmq."q_${nom}"`)).rows[0].total;
  const profondeurVisible = async (executeur, nom) =>
    (await executeur.query(`select count(*)::int as total from pgmq."q_${nom}" where vt <= now()`)).rows[0].total;
  const effets = async (executeur) =>
    (await executeur.query(`select effects from "${schema}".state`)).rows[0].effects;

  const effetIncrement = async ({ client }) => {
    await client.query(`update "${schema}".state set effects = effects + 1 where singleton`);
  };
  const effetEnPanne = async () => {
    throw Object.assign(new Error("panne transitoire injectée"), { code: "CI_OUTBOX_FAULT" });
  };

  const consommer = (connexion, handler, options = {}) =>
    worker.processDeferredEffects({
      connection: connexion,
      jobId: worker.createJobId(),
      handler,
      queue,
      deadLetterQueue,
      batchSize: 5,
      visibilityTimeoutSeconds: 30,
      ...options,
    });

  await pool.query(`create schema "${schema}"`);
  await pool.query(
    `create table "${schema}".state(singleton boolean primary key default true check(singleton), effects integer not null);` +
      ` insert into "${schema}".state(effects) values (0)`,
  );
  await pool.query("select pgmq.create($1)", [queue]);
  await pool.query("select pgmq.create($1)", [deadLetterQueue]);

  let connexionA;
  let connexionB;
  try {
    connexionA = await pool.connect();
    connexionB = await pool.connect();
    assert.notEqual(
      (await connexionA.query("select pg_backend_pid() as pid")).rows[0].pid,
      (await connexionB.query("select pg_backend_pid() as pid")).rows[0].pid,
      "le canari exige deux connexions PostgreSQL distinctes",
    );

    // ── (a) rollback de la mutation métier ⇒ aucun message publié ──────────────
    const annulee = enveloppe();
    await connexionA.query("BEGIN");
    await connexionA.query(`update "${schema}".state set effects = effects + 1 where singleton`);
    await publier(connexionA, annulee);
    assert.equal(await profondeur(connexionA, queue), 1, "(a) le message doit exister À L'INTÉRIEUR de la transaction");
    await connexionA.query("ROLLBACK");
    assert.equal(await profondeur(pool, queue), 0, "(a) le rollback de la mutation ne doit publier aucun message");
    assert.equal(await effets(pool), 0, "(a) le rollback doit aussi annuler l'effet métier");

    // ── (b) rejeu du même messageId ⇒ effet appliqué une seule fois ────────────
    const rejouee = enveloppe();
    await publier(pool, rejouee);
    const premiere = await consommer(connexionA, effetIncrement);
    assert.equal(premiere.processed, 1, "(b) la première livraison doit appliquer l'effet");
    assert.equal(premiere.duplicated, 0, "(b) la première livraison n'est pas un doublon");

    // Livraison at-least-once : la MÊME enveloppe revient sous un nouveau msg_id.
    await publier(pool, rejouee);
    const seconde = await consommer(connexionB, effetIncrement);
    assert.equal(seconde.duplicated, 1, "(b) le rejeu doit être reconnu comme doublon");
    assert.equal(seconde.processed, 0, "(b) le rejeu ne doit pas réappliquer l'effet");
    assert.equal(await effets(connexionA), 1, "(b) la connexion A doit observer un effet unique");
    assert.equal(await effets(connexionB), 1, "(b) la connexion B doit observer le même effet unique");
    assert.equal(
      (
        await pool.query("select count(*)::int as total from deferred.processed_messages where message_id = $1", [
          rejouee.messageId,
        ])
      ).rows[0].total,
      1,
      "(b) l'idempotence doit retenir exactement une trace du messageId",
    );
    assert.equal(await profondeur(pool, queue), 0, "(b) les deux livraisons doivent être supprimées de la queue");

    // ── (c) read_ct au-delà du seuil 5 ⇒ routage DLQ documenté ─────────────────
    const condamnee = enveloppe();
    await publier(pool, condamnee);
    let tentatives = 0;
    for (let essai = 1; essai <= worker.RETRY_THRESHOLD; essai += 1) {
      const echec = await consommer(connexionA, effetEnPanne, { visibilityTimeoutSeconds: 0 });
      tentatives += echec.failed;
      assert.equal(echec.deadLettered, 0, `(c) tentative ${essai} : le seuil n'est pas encore atteint`);
      assert.equal(await profondeur(pool, queue), 1, `(c) tentative ${essai} : un échec ne supprime pas le message`);
    }
    assert.equal(tentatives, worker.RETRY_THRESHOLD, "(c) le seuil doit laisser exactement 5 tentatives réelles");
    assert.equal(await effets(pool), 1, "(c) aucune tentative en échec ne doit produire d'effet");

    const jobId = worker.createJobId();
    const routage = await worker.processDeferredEffects({
      connection: connexionA,
      jobId,
      handler: effetEnPanne,
      queue,
      deadLetterQueue,
      batchSize: 5,
      visibilityTimeoutSeconds: 0,
    });
    assert.equal(routage.deadLettered, 1, "(c) la lecture au-delà du seuil doit router en DLQ");
    assert.equal(routage.failed, 0, "(c) le routage DLQ ne doit PAS tenter le traitement");
    assert.equal(await profondeur(pool, queue), 0, "(c) le message doit quitter la queue d'origine");
    assert.equal(await profondeur(pool, deadLetterQueue), 1, "(c) le message doit se trouver en DLQ");

    const mortes = await pool.query(`select message from pgmq."q_${deadLetterQueue}"`);
    const morte = mortes.rows[0].message;
    assert.equal(morte.messageId, condamnee.messageId, "(c) l'enveloppe DLQ doit porter le messageId d'origine");
    assert.equal(morte.jobId, jobId, "(c) l'enveloppe DLQ doit porter le jobId de l'exécution");
    assert.equal(morte.failureReason.errorCode, "CI_OUTBOX_FAULT", "(c) le motif doit venir de l'échec journalisé");
    assert.match(morte.failureReason.errorMessage, /panne transitoire injectée/, "(c) le motif doit être exploitable");
    assert.equal(morte.failureReason.readCt, worker.RETRY_THRESHOLD + 1, "(c) le motif doit porter le read_ct fautif");
    assert.deepEqual(
      morte.replayAction,
      {
        kind: "replay-to-queue",
        sourceQueue: deadLetterQueue,
        targetQueue: queue,
        worker: "src/workers/deferred-effects",
        operation: "replayDeadLetteredEffects",
      },
      "(c) l'enveloppe DLQ doit porter une action de reprise exécutable",
    );
    assert.equal(morte.payloadVersion, condamnee.payloadVersion, "(c) l'enveloppe AD-1 d'origine doit être préservée");

    // ── (d) rejeu depuis la DLQ ⇒ retraité avec succès ─────────────────────────
    const reprise = await worker.replayDeadLetteredEffects({
      connection: connexionB,
      queue,
      deadLetterQueue,
      batchSize: 5,
      visibilityTimeoutSeconds: 30,
    });
    assert.equal(reprise.replayed, 1, "(d) l'action de reprise doit republier le message");
    assert.deepEqual(reprise.messageIds, [condamnee.messageId], "(d) la reprise doit rendre le messageId d'origine");
    assert.equal(await profondeur(pool, deadLetterQueue), 0, "(d) la DLQ doit être vidée du message rejoué");
    assert.equal(await profondeur(pool, queue), 1, "(d) le message doit revenir sur la queue principale");

    const retraite = await consommer(connexionB, effetIncrement);
    assert.equal(retraite.processed, 1, "(d) le message rejoué depuis la DLQ doit être traité avec succès");
    assert.equal(await effets(pool), 2, "(d) l'effet du message rejoué doit être appliqué exactement une fois");
    assert.equal(await profondeur(pool, queue), 0, "(d) la queue doit être vide après reprise");

    // ── (e) Route Handler sans header valide ⇒ 401 ────────────────────────────
    const secret = process.env.DEFERRED_EFFECTS_WORKER_SECRET;
    const appeler = (headers) =>
      routeHandler.POST(new Request("http://ci.invalid/api/deferred-effects/process", { method: "POST", headers }));
    assert.equal((await appeler(undefined)).status, 401, "(e) un appel sans header Authorization doit être refusé");
    assert.equal(
      (await appeler({ authorization: `Bearer ${secret}-faux` })).status,
      401,
      "(e) un secret erroné doit être refusé",
    );
    assert.equal((await appeler({ authorization: secret })).status, 401, "(e) un header sans schéma Bearer doit être refusé");
    const autorise = await appeler({ authorization: `Bearer ${secret}` });
    assert.equal(autorise.status, 200, "(e) le secret valide doit être accepté, sinon le 401 ne prouve rien");
    assert.equal((await autorise.json()).skipped, false, "(e) l'exécution autorisée doit réellement déléguer au worker");

    // ── (f) lot borné et revisibilité après expiration du VT ───────────────────
    const tailleLot = 3;
    const vt = 4;
    const lot = [];
    for (let index = 0; index < tailleLot + 5; index += 1) {
      const message = enveloppe();
      lot.push(message);
      await publier(pool, message);
    }
    assert.equal(await profondeur(pool, queue), lot.length, "(f) le lot complet doit être en file");

    const lotUn = await consommer(connexionA, effetEnPanne, { batchSize: tailleLot, visibilityTimeoutSeconds: vt });
    assert.equal(lotUn.read, tailleLot, "(f) exactement batchSize messages doivent être lus");
    assert.equal(lotUn.failed, tailleLot, "(f) tout le lot lu doit échouer sur cet essai");
    assert.equal(await profondeur(pool, queue), lot.length, "(f) un échec ne supprime aucun message");
    assert.equal(
      await profondeurVisible(pool, queue),
      lot.length - tailleLot,
      "(f) le lot lu doit devenir invisible pendant le VT",
    );

    const lotDeux = await consommer(connexionA, effetEnPanne, { batchSize: tailleLot, visibilityTimeoutSeconds: vt });
    assert.equal(lotDeux.read, tailleLot, "(f) le second appel doit lire un autre lot borné");
    assert.equal(
      await profondeurVisible(pool, queue),
      lot.length - 2 * tailleLot,
      "(f) deux lots doivent désormais être invisibles",
    );

    const reste = await consommer(connexionA, effetIncrement, { batchSize: tailleLot });
    assert.equal(reste.read, lot.length - 2 * tailleLot, "(f) seuls les messages encore visibles sont consommables");
    assert.equal(reste.processed, lot.length - 2 * tailleLot, "(f) les messages restants doivent être traités");

    const aVide = await consommer(connexionA, effetIncrement, { batchSize: tailleLot });
    assert.equal(aVide.read, 0, "(f) tant que le VT court, aucun message masqué n'est relu");

    await attendre((vt + 1) * 1000);
    assert.equal(
      await profondeurVisible(pool, queue),
      2 * tailleLot,
      "(f) les messages non traités redeviennent visibles après expiration du VT",
    );

    const reprisUn = await consommer(connexionA, effetIncrement, { batchSize: tailleLot });
    assert.equal(reprisUn.processed, tailleLot, "(f) le premier lot redevenu visible doit être traité");
    const reprisDeux = await consommer(connexionB, effetIncrement, { batchSize: tailleLot });
    assert.equal(reprisDeux.processed, tailleLot, "(f) le second lot redevenu visible doit être traité");
    assert.equal(await profondeur(pool, queue), 0, "(f) le lot complet doit finir consommé, sans perte");
    assert.equal(await effets(pool), 2 + lot.length, "(f) chaque message du lot doit produire exactement un effet");

    process.stdout.write(
      "Canari outbox: (a) rollback sans publication, (b) rejeu idempotent sur deux connexions, " +
        "(c) routage DLQ documente au-dela du seuil, (d) reprise depuis la DLQ, " +
        "(e) refus 401 du Route Handler, (f) lot borne et revisibilite apres VT.\n",
    );
  } finally {
    connexionA?.release();
    connexionB?.release();
    try {
      await noyau?.closeDatabasePool();
    } catch {
      // Le Pool partagé du Route Handler peut n'avoir jamais été construit.
    }
    for (const nettoyage of [
      ["delete from deferred.processed_messages where message_id = any($1::uuid[])", [messageIds]],
      ["delete from deferred.effect_failures where message_id = any($1::uuid[])", [messageIds]],
      ["select pgmq.drop_queue($1)", [queue]],
      ["select pgmq.drop_queue($1)", [deadLetterQueue]],
      [`drop schema "${schema}" cascade`, []],
    ]) {
      try {
        await pool.query(nettoyage[0], nettoyage[1]);
      } catch {
        // Le nettoyage est opportuniste : la base du harnais est détruite juste après.
      }
    }
    await pool.end();
  }
}
