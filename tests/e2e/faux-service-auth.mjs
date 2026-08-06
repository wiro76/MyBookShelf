import { createServer } from "node:http";
import { argv } from "node:process";

/**
 * Faux service d'authentification — story 1.6, tâche T6.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS
 * ────────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS une preuve d'authentification, et il ne doit jamais être lu comme telle. Un
 * serveur qui répond « oui » ne prouve rien d'autre que sa propre complaisance. La vérité du
 * service — qu'un mot de passe est réellement vérifié, qu'une session est réellement signée,
 * que RLS isole réellement deux comptes — est établie ailleurs, par
 * `tests/integration/database-identity-auth-canary.mjs`, contre le VRAI GoTrue de la pile
 * éphémère, dans la porte `database`. C'est la répartition des preuves imposée par la story.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL EST, ET POURQUOI IL EXISTE
 * ────────────────────────────────────────────────────────────────────────────────
 * Le job `browser` de la CI n'a ni Docker ni Supabase, et démarrer une pile depuis Playwright
 * est explicitement proscrit. Or les AC 1 et 3 portent sur l'INTERFACE : la redirection sans
 * session, la conservation de la saisie, la liaison erreur↔champ, la règle de focus. Ces
 * comportements dépendent d'une seule chose du service : le VERDICT qu'il rend. Trois verdicts
 * suffisent, et ce fichier ne fait que les émettre de façon déterministe :
 *
 *   - 200 + session      → le formulaire redirige vers la destination validée ;
 *   - 400 invalid_grant  → refus d'identifiants (`#erreur-identifiants`), UNE erreur ;
 *   - 503                → panne (`#alerte-reseau`), qui n'efface pas les erreurs de champ.
 *
 * Sans lui, `SUPABASE_URL` pointait sur un port où rien n'écoutait : TOUTE soumission tombait
 * dans la branche « panne », et ni le refus d'identifiants ni la connexion réussie n'étaient
 * atteignables depuis le navigateur. Deux des trois branches d'écran n'étaient donc jamais
 * exercées, et la règle de focus du refus — une erreur, deux champs marqués, focus sur
 * l'e-mail — reposait sur une lecture de code.
 *
 * ⚠️ `GET /auth/v1/user` ne reconnaît QUE le jeton qu'il a lui-même émis. C'est ce qui rend le
 * test du cookie falsifié honnête : altérer le cookie de session doit renvoyer sur `/connexion`,
 * exactement comme le ferait le vrai service. C'est la contrepartie observable du choix
 * `getUser()` plutôt que `getSession()` — un jeton non reconnu par le serveur n'est pas une
 * session, quel que soit son contenu.
 *
 * Le fichier ne porte pas `.spec.` : Playwright ne le ramasse pas comme test. Il est importé
 * par la suite e2e pour les identifiants, et lancé comme `webServer` par la configuration.
 */

/** Identifiants de démonstration. Aucun secret : ce service n'existe qu'en mémoire, en test. */
export const COMPTES = {
  valide: {
    email: "zan@exemple.test",
    password: "mot-de-passe-de-test-1234",
    id: "11111111-1111-4111-8111-111111111111",
  },
  rafraichissement: {
    email: "session-courte@exemple.test",
    password: "mot-de-passe-de-test-1234",
  },
  sessionIndisponible: {
    email: "session-indisponible@exemple.test",
    password: "mot-de-passe-de-test-1234",
  },
  /** Mot de passe volontairement faux, pour la branche « refus d'identifiants ». */
  mauvaisMotDePasse: "mot-de-passe-de-test-faux",
  /** Adresse qui déclenche un 503 : la branche « panne », distincte du refus. */
  emailEnPanne: "panne@exemple.test",
};

const base64url = (valeur) => Buffer.from(valeur).toString("base64url");

/**
 * Jeton de la FORME d'un JWT, et sans aucune valeur cryptographique.
 *
 * La forme compte, la signature non : `supabase-js` conserve la session telle qu'elle lui est
 * rendue et calcule son expiration à partir d'`expires_in`, mais du code de bibliothèque peut
 * décoder la charge utile. Un jeton opaque provoquerait un échec de décodage sans rapport avec
 * ce que l'on cherche à prouver. La signature est un remplissage : seul le service de
 * production la vérifie, et ce n'est pas ce qui est testé ici.
 */
const emettreJeton = (sub, dureeSecondes) => {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const charge = base64url(
    JSON.stringify({
      sub,
      aud: "authenticated",
      role: "authenticated",
      iss: "faux-service-auth",
      iat: maintenant,
      exp: maintenant + dureeSecondes,
      email: COMPTES.valide.email,
    }),
  );
  return `${entete}.${charge}.${base64url("signature-de-test-sans-valeur")}`;
};

/** Jetons émis pendant la vie du processus. `GET /auth/v1/user` ne reconnaît qu'eux. */
const jetonsEmis = new Set();
const jetonsIndisponibles = new Set();
const refreshTokens = new Set();
let rafraichissements = 0;

const DUREE_JETON = 3600;

const utilisateur = () => ({
  id: COMPTES.valide.id,
  aud: "authenticated",
  role: "authenticated",
  email: COMPTES.valide.email,
  email_confirmed_at: new Date(0).toISOString(),
  phone: "",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
});

export function demarrerFauxServiceAuth(port) {
  const serveur = createServer((requete, reponse) => {
    const url = new URL(requete.url ?? "/", `http://127.0.0.1:${port}`);
    const morceaux = [];
    requete.on("data", (morceau) => morceaux.push(morceau));
    requete.on("end", () => {
      const brut = Buffer.concat(morceaux).toString("utf8");
      let corps = {};
      try {
        corps = brut.length > 0 ? JSON.parse(brut) : {};
      } catch {
        corps = {};
      }

      const repondre = (statut, charge) => {
        const texte = JSON.stringify(charge);
        reponse.writeHead(statut, { "content-type": "application/json", "cache-control": "no-store" });
        reponse.end(texte);
      };

      if (url.pathname === "/sante") return repondre(200, { ok: true, rafraichissements });

      if (url.pathname === "/auth/v1/token" && requete.method === "POST") {
        const grantType = url.searchParams.get("grant_type");
        if (grantType === "refresh_token") {
          if (!refreshTokens.delete(corps.refresh_token)) {
            return repondre(400, { error_code: "refresh_token_not_found", code: 400 });
          }
          const jeton = emettreJeton(COMPTES.valide.id, DUREE_JETON);
          const refreshToken = `refresh-${jetonsEmis.size + 1}`;
          jetonsEmis.add(jeton);
          refreshTokens.add(refreshToken);
          rafraichissements += 1;
          return repondre(200, {
            access_token: jeton,
            token_type: "bearer",
            expires_in: DUREE_JETON,
            expires_at: Math.floor(Date.now() / 1000) + DUREE_JETON,
            refresh_token: refreshToken,
            user: utilisateur(),
          });
        }
        if (grantType !== "password") {
          return repondre(400, { error: "unsupported_grant_type" });
        }
        if (corps.email === COMPTES.emailEnPanne) {
          // 503 : hors de la plage 4xx, donc classé « panne » et non « refus » par
          // `isCredentialRefusal`. C'est la branche `#alerte-reseau`.
          return repondre(503, { message: "service indisponible" });
        }
        const estCompteValide = corps.email === COMPTES.valide.email && corps.password === COMPTES.valide.password;
        const estSessionCourte =
          corps.email === COMPTES.rafraichissement.email && corps.password === COMPTES.rafraichissement.password;
        const estSessionIndisponible =
          corps.email === COMPTES.sessionIndisponible.email &&
          corps.password === COMPTES.sessionIndisponible.password;
        if (estCompteValide || estSessionCourte || estSessionIndisponible) {
          const duree = estSessionCourte ? 1 : DUREE_JETON;
          const jeton = emettreJeton(COMPTES.valide.id, duree);
          const refreshToken = `refresh-${jetonsEmis.size + 1}`;
          jetonsEmis.add(jeton);
          if (estSessionIndisponible) jetonsIndisponibles.add(jeton);
          refreshTokens.add(refreshToken);
          return repondre(200, {
            access_token: jeton,
            token_type: "bearer",
            expires_in: duree,
            expires_at: Math.floor(Date.now() / 1000) + duree,
            refresh_token: refreshToken,
            user: utilisateur(),
          });
        }
        // Message UNIQUE : le faux service reproduit le refus indistinct du vrai — un compte
        // inconnu et un mot de passe erroné sont indiscernables ici aussi.
        return repondre(400, {
          error: "invalid_grant",
          error_description: "Invalid login credentials",
          error_code: "invalid_credentials",
          msg: "Invalid login credentials",
          code: 400,
        });
      }

      if (url.pathname === "/auth/v1/user" && requete.method === "GET") {
        const entete = requete.headers.authorization ?? "";
        const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : "";
        if (jetonsIndisponibles.has(jeton)) return repondre(503, { message: "service indisponible" });
        // ⚠️ Le cœur du test du cookie falsifié : seul un jeton ÉMIS par ce service est reconnu.
        if (!jetonsEmis.has(jeton)) {
          return repondre(401, { message: "invalid claim: missing sub claim", code: 401 });
        }
        return repondre(200, utilisateur());
      }

      if (url.pathname === "/auth/v1/logout") return repondre(204, {});

      return repondre(404, { message: "route absente du faux service" });
    });
  });
  serveur.listen(port, "127.0.0.1");
  return serveur;
}

// Lancé comme `webServer` par Playwright : on démarre. Importé par la suite e2e pour lire
// `COMPTES` : on ne démarre rien, sans quoi chaque worker ouvrirait un serveur de plus.
//
// ⚠️ La détection passe par `argv[1]` et NON par `import.meta.url`. Playwright transpile les
// specs — et ce qu'elles importent — vers CommonJS, où `import.meta` est une erreur de syntaxe
// à l'analyse, avant même l'exécution : le fichier entier devenait alors illisible depuis la
// suite e2e. Une comparaison de chemin est plus fruste, et elle survit aux deux formats.
if (argv[1]?.replace(/\\/g, "/").endsWith("tests/e2e/faux-service-auth.mjs")) {
  const port = Number(process.env.FAUX_AUTH_PORT ?? 3101);
  demarrerFauxServiceAuth(port);
  process.stdout.write(`Faux service d'authentification en ecoute sur http://127.0.0.1:${port}\n`);
}
