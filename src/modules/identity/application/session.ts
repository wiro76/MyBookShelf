import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireRuntimeEnvironment } from "@/shared/config/environment";

/**
 * Session serveur — story 1.6 (AC 1, AC 2 ; AD-10).
 *
 * Supabase Auth **identifie, et rien d'autre**. Ce module ne lit ni n'écrit aucune table
 * métier : il transforme les cookies de la requête en un identifiant d'utilisateur vérifié,
 * que `authenticatedTransaction` consommera. Toute donnée passe ensuite par node-postgres et
 * du SQL paramétré (AD-3).
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * ⚠️ `getUser()`, JAMAIS `getSession()`
 * ════════════════════════════════════════════════════════════════════════════════
 * C'est le cœur de la story, et la seule ligne qu'il ne faut pas « simplifier ».
 *
 * `getSession()` DÉCODE le cookie et rend son contenu. Il ne vérifie pas la signature du
 * jeton. Le cookie étant, par définition, une valeur envoyée par le navigateur, n'importe
 * quel `sub` peut y être écrit à la main : `getSession().user.id` est donc une valeur
 * CONTRÔLÉE PAR LE CLIENT, exactement au même titre qu'un champ de formulaire.
 *
 * `getUser()` envoie le jeton au serveur d'authentification, qui en vérifie la signature et
 * la validité, et rend l'utilisateur que le serveur reconnaît.
 *
 * La conséquence, si l'on se trompait ici, est plus grave que « une garde plus faible ».
 * L'identifiant produit par ce module alimente les DEUX couches de la double barrière
 * d'AD-10 : la vérification applicative d'ownership (`where user_id = $1`) ET le claim que
 * `authenticatedTransaction` pose pour RLS (`request.jwt.claim.sub`, dont dépend
 * `auth.uid()`). Avec `getSession()`, les deux couches vérifieraient la même valeur forgée,
 * et se déclareraient d'accord. L'AC 4 serait vert sur une protection contournable en
 * éditant un cookie — c'est-à-dire la définition exacte d'un test qui ment.
 *
 * Le coût est un aller-retour réseau par requête. Il est assumé : c'est le prix de la seule
 * vérification qui ait une valeur.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * COOKIES httpOnly
 * ────────────────────────────────────────────────────────────────────────────────
 * `@supabase/ssr` gère l'encodage et le découpage des cookies de session ; les attributs de
 * sécurité, eux, sont IMPOSÉS ici et ne sont jamais repris de l'appelant :
 *   - `httpOnly` — le jeton reste invisible à `document.cookie`, donc hors de portée d'un
 *     script injecté. C'est ce qui distingue cette implémentation d'un client navigateur.
 *   - `sameSite: "lax"` — le cookie n'accompagne pas une requête inter-site non navigationnelle.
 *   - `secure` hors local — un cookie de session en clair sur le réseau n'en est plus un.
 *   - `path: "/"` — la session vaut pour toute l'application, jamais pour un sous-arbre.
 * Les seuls attributs repris de `@supabase/ssr` sont ceux qui portent la DURÉE de vie
 * (`maxAge`, `expires`) et le domaine : la bibliothèque sait quand un jeton expire, nous non.
 */

/**
 * Un utilisateur vérifié, réduit à son identifiant.
 *
 * Volontairement sans e-mail : l'observabilité interdit « email, titre personnel, contenu
 * importé ni URL signée » dans les journaux, et le moyen le plus sûr de ne pas journaliser
 * une adresse est de ne pas la transporter. Ce qu'il faut afficher d'un compte se lit en base,
 * sous transaction authentifiée.
 */
export type VerifiedUser = {
  /** `sub` vérifié par le serveur d'authentification. Format UUID. */
  id: string;
};

/**
 * `secure` partout sauf en local : le développement sert en http sur 127.0.0.1, et un cookie
 * `Secure` y serait purement et simplement ignoré par le navigateur.
 *
 * Nommée `requiresSecureCookies` et non `useSecureCookies` : un identifiant commençant par
 * `use` est traité comme un hook React par la règle `react-hooks/rules-of-hooks`.
 */
function requiresSecureCookies(environment: string): boolean {
  return environment !== "local";
}

/**
 * Construit un client Supabase lié aux cookies de la requête EN COURS.
 *
 * Un client par rendu, jamais de singleton : un client partagé entre deux requêtes
 * partagerait leurs sessions. C'est la même règle que le client `pg`, pour la même raison.
 */
export async function createServerSupabaseClient() {
  const { environment, supabaseUrl, supabaseKey } = requireRuntimeEnvironment();
  const cookieStore = await cookies();
  const secure = requiresSecureCookies(environment);

  return createServerClient(supabaseUrl, supabaseKey, {
    auth: {
      // Aucun jeton dans l'URL : le flux par mot de passe n'en a pas besoin, et
      // `detectSessionInUrl` n'a de sens que côté navigateur.
      detectSessionInUrl: false,
      persistSession: true,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set({
              name,
              value,
              // Attributs de sécurité imposés, jamais négociés avec l'appelant.
              httpOnly: true,
              sameSite: "lax",
              secure,
              path: "/",
              // Durée de vie : celle que la bibliothèque a calculée depuis le jeton.
              domain: options.domain,
              maxAge: options.maxAge,
              expires: options.expires,
            });
          }
        } catch {
          // Un Server Component ne peut pas écrire de cookie : Next lève. Ce n'est pas une
          // panne — le rafraîchissement de jeton sera réécrit par la prochaine Server Action
          // ou le prochain Route Handler, qui, eux, le peuvent. Rien n'est journalisé : ce
          // chemin est nominal à chaque rendu de page privée, et le bruit noierait les
          // vraies erreurs.
        }
      },
    },
  });
}

/**
 * Rend l'utilisateur **vérifié par le serveur**, ou `null`.
 *
 * `null` couvre indifféremment : aucun cookie, cookie expiré, cookie forgé, jeton révoqué,
 * serveur d'authentification injoignable. Aucun appelant n'a besoin de distinguer ces cas —
 * et les distinguer offrirait à un attaquant un moyen de sonder l'état du système.
 *
 * Ne lève jamais : une page privée doit pouvoir rediriger plutôt que rendre une erreur 500
 * quand l'authentification est indisponible.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  try {
    const supabase = await createServerSupabaseClient();
    // ⚠️ `getUser()` — voir l'en-tête. `getSession()` est PROSCRIT dans tout le module.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    return { id: data.user.id };
  } catch {
    return null;
  }
}
