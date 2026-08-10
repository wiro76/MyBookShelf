import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Canari d'authentification — story 1.6, tâche T5b (AC 2 et AC 4).
 *
 * Il prouve PAR EXÉCUTION RÉELLE contre la pile Supabase éphémère du harnais — GoTrue et Kong
 * inclus depuis cette story — jamais par inspection de texte :
 *   (a) un compte semé par l'API admin peut se connecter par e-mail + mot de passe, et la
 *       session obtenue est reconnue par le serveur d'authentification lui-même ;
 *   (b) le MÊME compte avec un mauvais mot de passe est refusé, et le refus est un 4xx hors
 *       429 — c'est-à-dire exactement ce que `isCredentialRefusal` classe comme refus ;
 *   (c) un compte inexistant produit une réponse INDISCERNABLE du mot de passe erroné, donc
 *       aucun oracle d'énumération de comptes ;
 *   (d) sous l'identité d'un SECOND utilisateur réellement authentifié, une lecture des
 *       données du premier ne renvoie rien, et une écriture à son nom est refusée en 42501 ;
 *   (e) le code applicatif réel (`loadPrivateLibrarySummary`) rend le résumé du propriétaire
 *       et un résumé vide à l'intrus, sur la même base et les mêmes lignes.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POURQUOI L'API ADMIN, ET SURTOUT PAS UN `insert into auth.users`
 * ────────────────────────────────────────────────────────────────────────────────
 * `identity-rls.test.sql` insère des lignes nues dans `auth.users`, et c'est légitime : il ne
 * teste que des politiques, et une clé étrangère satisfaite lui suffit. Ici, non. GoTrue ne
 * cherche pas le mot de passe dans `auth.users` seul : il exige une ligne `auth.identities`
 * conforme (`provider = 'email'`, `provider_id`, `identity_data` portant `sub` et `email`),
 * qu'aucun `insert` écrit à la main ne reproduit fidèlement d'une version à l'autre. Un compte
 * semé de cette façon existe en base et ne peut PAS se connecter — l'échec ressemblerait alors
 * à un défaut de mot de passe et enverrait chercher très loin.
 *
 * `POST /auth/v1/admin/users` avec la clé de service et `email_confirm: true` construit les
 * deux lignes comme le ferait une inscription réelle, sans envoyer de courriel : c'est ce qui
 * permet de garder `mailpit` exclu du harnais.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * NOM DU FICHIER : sans `.test.`, délibérément
 * ────────────────────────────────────────────────────────────────────────────────
 * `ci:integration` globbe `tests/integration/*.test.mjs` et s'exécute SANS base de données.
 * Un canari nommé `.test.mjs` y serait ramassé et casserait cette porte. Il n'est lancé que
 * par `scripts/run-database-gates.mjs`, qui lui fournit la base et les clés de la pile.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * IMPORT DU VRAI CODE `src/` DEPUIS UN `.mjs` : motif de `database-outbox-canary.mjs`
 * ────────────────────────────────────────────────────────────────────────────────
 * Import direct, relance unique sous `--experimental-strip-types` si l'effacement de types
 * n'est pas actif par défaut, et `registerHooks` pour l'alias `@/`, les imports relatifs sans
 * extension entre fichiers `.ts`, et les imports JSON de configuration. Aucun build, aucune
 * dépendance. Le canari importe le code de production parce qu'un canari qui réimplémenterait
 * la transaction authentifiée ne prouverait que sa propre réimplémentation.
 */

const RACINE = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINELLE_RELANCE = "CANARI_IDENTITE_EFFACEMENT_TYPES";

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
    if (specificateur === "next/headers") return suivant("next/headers.js", contexte);
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

let noyau = null;
let bibliothequePrivee = null;
let sessionApplicative = null;
let connexionApplicative = null;
try {
  noyau = await importerSource("src/shared/kernel/index.ts");
  bibliothequePrivee = await importerSource("src/modules/identity/application/private-library.ts");
  sessionApplicative = await importerSource("src/modules/identity/application/session.ts");
  connexionApplicative = await importerSource("src/modules/identity/application/sign-in.ts");
} catch (erreur) {
  if (process.env[SENTINELLE_RELANCE] || !estErreurEffacementTypes(erreur)) throw erreur;
  const relance = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: { ...process.env, [SENTINELLE_RELANCE]: "1" },
  });
  process.exitCode = relance.status ?? 1;
}

if (noyau) {
  try {
    await executerCanari();
  } catch (erreur) {
    console.error(erreur instanceof Error ? (erreur.stack ?? erreur.message) : erreur);
    process.exitCode = 1;
  }
}

async function executerCanari() {
  for (const variable of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) throw new Error(`${variable} est obligatoire`);
  }

  const fixture = JSON.parse(readFileSync(resolvePath(RACINE, "tests/fixtures/identity-test-user.json"), "utf8"));
  const { proprietaire, intrus, inconnu, mauvaisMotDePasse } = fixture;

  const apiUrl = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  /**
   * Appel HTTP brut, sans `supabase-js`.
   *
   * Le client officiel enveloppe les échecs dans ses propres classes d'erreur : il rendrait la
   * preuve (b) circulaire, puisqu'on vérifierait la classification d'une erreur… à partir de
   * l'objet que le code de production classe déjà. On veut le STATUT HTTP tel que GoTrue
   * l'émet, avant toute interprétation, pour pouvoir confirmer ou infirmer la règle
   * « 4xx hors 429 = refus » sur laquelle repose `isCredentialRefusal`.
   */
  const appelerAuth = async (chemin, { methode = "POST", jeton = anonKey, corps } = {}) => {
    const reponse = await fetch(`${apiUrl}${chemin}`, {
      method: methode,
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${jeton}`,
        ...(corps === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
    });
    const texte = await reponse.text();
    let charge = null;
    try {
      charge = texte.length > 0 ? JSON.parse(texte) : null;
    } catch {
      charge = { brut: texte.slice(0, 200) };
    }
    return { statut: reponse.status, charge };
  };

  const semerCompte = async ({ email, password }) => {
    const { statut, charge } = await appelerAuth("/auth/v1/admin/users", {
      jeton: serviceRoleKey,
      corps: { email, password, email_confirm: true },
    });
    assert.ok(
      statut === 200 || statut === 201,
      `l'API admin doit créer le compte (statut ${statut}, corps ${JSON.stringify(charge)?.slice(0, 300)})`,
    );
    assert.match(String(charge?.id ?? ""), /^[0-9a-f-]{36}$/, "l'API admin doit rendre l'identifiant du compte créé");
    return charge.id;
  };

  const seConnecter = ({ email, password }) =>
    appelerAuth("/auth/v1/token?grant_type=password", { corps: { email, password } });

  const comptes = [];
  const { authenticatedTransaction, closeDatabasePool } = noyau;
  const { loadPrivateLibrarySummary } = bibliothequePrivee;

  try {
    // ── (a) connexion réelle : la session est établie et VÉRIFIÉE par le serveur ───────────
    const idProprietaire = await semerCompte(proprietaire);
    const idIntrus = await semerCompte(intrus);
    comptes.push(idProprietaire, idIntrus);
    assert.notEqual(idProprietaire, idIntrus, "(a) les deux comptes doivent être distincts");

    const connexion = await seConnecter(proprietaire);
    assert.equal(
      connexion.statut,
      200,
      // Le corps fait partie du message : un 422 `email_provider_disabled` et un 400
      // `invalid_credentials` portent le même verdict « pas 200 » et désignent pourtant deux
      // causes sans rapport — l'une est une erreur de `supabase/config.toml`, l'autre un
      // véritable refus. Sans le corps, la première se cherche très longtemps.
      `(a) les identifiants valides doivent être acceptés (statut ${connexion.statut}, corps ${JSON.stringify(connexion.charge)?.slice(0, 300)})`,
    );
    assert.equal(typeof connexion.charge?.access_token, "string", "(a) la connexion doit rendre un jeton d'accès");
    assert.equal(typeof connexion.charge?.refresh_token, "string", "(a) la connexion doit établir une session rafraîchissable");
    assert.equal(connexion.charge?.user?.id, idProprietaire, "(a) le jeton doit désigner le compte semé");

    // La session ne vaut que si le SERVEUR la reconnaît. C'est la contrepartie exacte du
    // `getUser()` de `session.ts` : le jeton est renvoyé au service, qui en vérifie la
    // signature. Un jeton simplement décodé côté client ne prouverait rien.
    const verifiee = await appelerAuth("/auth/v1/user", { methode: "GET", jeton: connexion.charge.access_token });
    assert.equal(verifiee.statut, 200, "(a) le serveur d'authentification doit reconnaître le jeton émis");
    assert.equal(verifiee.charge?.id, idProprietaire, "(a) le serveur doit rendre le MÊME compte que le jeton");

    // Le même parcours par le VRAI code applicatif et l'adaptateur SSR : il doit classifier le
    // verdict, sérialiser la session en cookies sécurisés, puis permettre à un second client de
    // faire reconnaître ces cookies par le vrai GoTrue. Cette preuve ferme l'écart entre le
    // canari HTTP réel et les e2e qui utilisent un faux service.
    const cookiesApplicatifs = new Map();
    const optionsCookies = new Map();
    const adaptateurCookies = {
      getAll: () => [...cookiesApplicatifs].map(([name, value]) => ({ name, value })),
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          if (value.length === 0 || options.maxAge === 0) cookiesApplicatifs.delete(name);
          else cookiesApplicatifs.set(name, value);
          optionsCookies.set(name, options);
        }
      },
    };
    const environnementApplicatif = {
      ...process.env,
      APP_ENV: "local",
      TARGET_FINGERPRINT: "local-mbs-v1",
    };
    const creerClientApplicatif = () =>
      sessionApplicative.createSupabaseClientForCookies(adaptateurCookies, {
        cookieWrites: "required",
        source: environnementApplicatif,
      });
    const verdictApplicatif = await connexionApplicative.signInWithPassword(proprietaire, {
      createClient: creerClientApplicatif,
    });
    assert.deepEqual(verdictApplicatif, { status: "success" }, "(a) le cas d'usage applicatif doit accepter le compte");
    assert.ok(cookiesApplicatifs.size > 0, "(a) le client SSR doit persister au moins un cookie de session");
    for (const options of optionsCookies.values()) {
      assert.equal(options.httpOnly, true, "(a) chaque cookie de session doit être HttpOnly");
      assert.equal(options.sameSite, "lax", "(a) chaque cookie de session doit être SameSite=Lax");
      assert.equal(options.path, "/", "(a) chaque cookie de session doit couvrir toute l'application");
      assert.equal(options.secure, false, "(a) la pile locale HTTP ne doit pas émettre de cookie Secure");
    }
    const utilisateurApplicatif = await creerClientApplicatif().auth.getUser();
    assert.equal(utilisateurApplicatif.error, null, "(a) le vrai GoTrue doit reconnaître les cookies SSR applicatifs");
    assert.equal(
      utilisateurApplicatif.data.user?.id,
      idProprietaire,
      "(a) les cookies SSR doivent désigner le compte réellement authentifié",
    );

    const optionsPreview = [];
    const clientPreview = sessionApplicative.createSupabaseClientForCookies(
      {
        getAll: () => [],
        setAll(cookiesToSet) {
          optionsPreview.push(...cookiesToSet.map(({ options }) => options));
        },
      },
      {
        cookieWrites: "required",
        source: { ...process.env, APP_ENV: "preview", TARGET_FINGERPRINT: "preview-mbs-v1" },
      },
    );
    const sessionPreview = await clientPreview.auth.setSession({
      access_token: connexion.charge.access_token,
      refresh_token: connexion.charge.refresh_token,
    });
    assert.equal(sessionPreview.error, null, "(a) les jetons réels doivent pouvoir être sérialisés en preview");
    assert.ok(optionsPreview.length > 0, "(a) la sérialisation preview doit produire des cookies");
    assert.ok(optionsPreview.every(({ secure }) => secure === true), "(a) tout cookie hors local doit porter Secure");

    const ecritureImpossible = await connexionApplicative.signInWithPassword(proprietaire, {
      createClient: () =>
        sessionApplicative.createSupabaseClientForCookies(
          {
            getAll: () => [],
            setAll() {
              throw new Error("réponse déjà envoyée");
            },
          },
          { cookieWrites: "required", source: environnementApplicatif },
        ),
    });
    assert.deepEqual(
      ecritureImpossible,
      { status: "unavailable" },
      "(a) une session non persistable doit être une panne, jamais un faux succès",
    );

    // Un jeton forgé n'est pas une session : c'est ce qui distingue `getUser()` de
    // `getSession()`, et c'est la raison d'être de l'aller-retour réseau par requête.
    const forge = await appelerAuth("/auth/v1/user", { methode: "GET", jeton: `${connexion.charge.access_token}x` });
    assert.ok(forge.statut >= 400, `(a) un jeton altéré doit être rejeté (statut ${forge.statut})`);

    // ── (b) refus d'identifiants : le VERDICT sur la règle 4xx hors 429 ───────────────────
    const refus = await seConnecter({ email: proprietaire.email, password: mauvaisMotDePasse });
    assert.ok(
      refus.statut >= 400 && refus.statut < 500,
      `(b) un mauvais mot de passe doit produire un 4xx, pas ${refus.statut}`,
    );
    assert.notEqual(refus.statut, 429, "(b) un refus ne doit pas être confondu avec une limitation de débit");
    assert.notEqual(refus.charge?.access_token, connexion.charge.access_token, "(b) aucun jeton ne doit être émis");
    assert.equal(refus.charge?.access_token, undefined, "(b) un refus ne rend aucun jeton");
    assert.equal(
      connexionApplicative.isCredentialRefusal({ status: 422, code: "email_provider_disabled" }),
      false,
      "(b) un 4xx de configuration ne doit jamais être classé comme refus d'identifiants",
    );
    assert.equal(
      connexionApplicative.isCredentialRefusal({ status: 400, code: "invalid_credentials" }),
      true,
      "(b) seul un code Auth de refus attendu doit accuser les identifiants",
    );

    // ── (c) aucun oracle d'énumération : compte inconnu = mot de passe erroné ─────────────
    const inexistant = await seConnecter(inconnu);
    assert.equal(
      inexistant.statut,
      refus.statut,
      "(c) un compte inconnu doit produire le MÊME statut qu'un mot de passe erroné",
    );
    assert.equal(
      inexistant.charge?.error_code ?? inexistant.charge?.error ?? null,
      refus.charge?.error_code ?? refus.charge?.error ?? null,
      "(c) un compte inconnu doit produire le MÊME code d'erreur qu'un mot de passe erroné",
    );

    // Le canari REND COMPTE du statut observé : la règle « 4xx hors 429 = refus » est une
    // décision de `sign-in.ts`, et cette ligne est la seule chose qui la relie à la réalité
    // du service. Si une version future de GoTrue changeait de statut, elle le dirait ici.
    process.stdout.write(
      `Canari identite: refus d'identifiants observe en HTTP ${refus.statut} ` +
        `(code ${JSON.stringify(refus.charge?.error_code ?? refus.charge?.error ?? null)}), ` +
        `compte inconnu en HTTP ${inexistant.statut} — classement refus/panne confirme.\n`,
    );

    // ── (d) isolation prouvée sous DEUX identités réellement authentifiées ────────────────
    // Les lignes sont écrites par la VRAIE transaction authentifiée, donc sous
    // `set local role authenticated` et `request.jwt.claim.sub` : les politiques `own_profile`
    // et `own_private_notes` s'appliquent à l'écriture comme à la lecture.
    await authenticatedTransaction(idProprietaire, async (client) => {
      await client.query("insert into identity.profiles (user_id, display_name) values ($1, $2)", [
        idProprietaire,
        proprietaire.displayName,
      ]);
      await client.query("insert into identity.private_notes (user_id, body) values ($1, $2)", [
        idProprietaire,
        proprietaire.note,
      ]);
    });
    await authenticatedTransaction(idIntrus, async (client) => {
      await client.query("insert into identity.profiles (user_id, display_name) values ($1, $2)", [
        idIntrus,
        intrus.displayName,
      ]);
    });

    // Requêtes SANS `where user_id = …` : c'est délibéré, et c'est tout l'intérêt. Un `where`
    // rendrait le test vert même sans aucune politique — il prouverait le `where`, pas RLS.
    // Ici, seule la politique peut expliquer que l'intrus ne voie rien.
    const vuParLIntrus = await authenticatedTransaction(idIntrus, async (client) =>
      (await client.query("select id, user_id from identity.private_notes")).rows,
    );
    assert.deepEqual(vuParLIntrus, [], "(d) l'intrus ne doit voir AUCUNE note, pas même leur identifiant");

    const vuParLeProprietaire = await authenticatedTransaction(idProprietaire, async (client) =>
      (await client.query("select user_id from identity.private_notes")).rows,
    );
    assert.deepEqual(
      vuParLeProprietaire.map((ligne) => ligne.user_id),
      [idProprietaire],
      "(d) le propriétaire doit voir sa note — sans quoi le vide de l'intrus ne prouverait rien",
    );

    const profilsVusParLIntrus = await authenticatedTransaction(idIntrus, async (client) =>
      (await client.query("select user_id from identity.profiles")).rows.map((ligne) => ligne.user_id),
    );
    assert.deepEqual(profilsVusParLIntrus, [idIntrus], "(d) l'intrus ne doit voir que son propre profil");

    // Mutation sans ownership : refusée par `with check`, en 42501.
    const usurpation = await authenticatedTransaction(idIntrus, async (client) => {
      try {
        await client.query("insert into identity.private_notes (user_id, body) values ($1, $2)", [
          idProprietaire,
          "usurpation",
        ]);
        return null;
      } catch (erreur) {
        return erreur.code;
      }
    }).catch((erreur) => erreur.code);
    assert.equal(usurpation, "42501", "(d) écrire une note au nom d'autrui doit être refusé en 42501");

    // Une mise à jour de masse ne doit toucher aucune ligne du propriétaire.
    const misesAJour = await authenticatedTransaction(idIntrus, async (client) =>
      (await client.query("update identity.private_notes set body = 'reecrite'")).rowCount,
    );
    assert.equal(misesAJour, 0, "(d) une écriture non ciblée ne doit atteindre aucune ligne d'autrui");
    const noteIntacte = await authenticatedTransaction(idProprietaire, async (client) =>
      (await client.query("select body from identity.private_notes")).rows[0]?.body,
    );
    assert.equal(noteIntacte, proprietaire.note, "(d) la note du propriétaire doit être restée intacte");

    // ── (e) le code applicatif réel, sur les mêmes lignes et les mêmes identités ──────────
    const resumeProprietaire = await loadPrivateLibrarySummary(idProprietaire);
    assert.deepEqual(
      resumeProprietaire,
      { displayName: proprietaire.displayName, noteCount: 1 },
      "(e) le propriétaire doit lire son profil et sa note par le chemin applicatif réel",
    );
    const resumeIntrus = await loadPrivateLibrarySummary(idIntrus);
    assert.deepEqual(
      resumeIntrus,
      { displayName: intrus.displayName, noteCount: 0 },
      "(e) l'intrus doit lire SON profil et aucune note du propriétaire",
    );

    process.stdout.write(
      "Canari identite: (a) session etablie et verifiee par le serveur, (b) mauvais mot de passe refuse, " +
        "(c) compte inconnu indiscernable, (d) isolation RLS sous deux identites reelles, " +
        "(e) chemin applicatif reel isole de bout en bout.\n",
    );
  } finally {
    try {
      await closeDatabasePool();
    } catch {
      // Le Pool partagé peut n'avoir jamais été construit si le canari a échoué très tôt.
    }
    // Nettoyage opportuniste : la pile est détruite juste après, mais laisser des comptes
    // derrière soi rendrait une exécution dépendante de l'état laissé par la précédente.
    for (const id of comptes) {
      try {
        await appelerAuth(`/auth/v1/admin/users/${id}`, { methode: "DELETE", jeton: serviceRoleKey });
      } catch {
        // Sans conséquence : la base éphémère disparaît avec le harnais.
      }
    }
  }
}
