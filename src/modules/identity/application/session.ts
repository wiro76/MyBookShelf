import { createServerClient, type CookieOptions, type GetAllCookies, type SetAllCookies } from "@supabase/ssr";
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

export type VerifiedSession =
  | { status: "authenticated"; user: VerifiedUser }
  | { status: "anonymous" }
  | { status: "unavailable" };

export type SupabaseCookie = { name: string; value: string; options: CookieOptions };

export type SupabaseCookieAdapter = {
  getAll: GetAllCookies;
  setAll: SetAllCookies;
};

type ServerClientOptions = {
  cookieWrites?: "best-effort" | "required";
  source?: NodeJS.ProcessEnv;
};

export const AUTH_REQUEST_TIMEOUT_MS = 10_000;

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

function authenticationFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

function secureCookie(cookie: SupabaseCookie, secure: boolean): SupabaseCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    options: {
      domain: cookie.options.domain,
      expires: cookie.options.expires,
      maxAge: cookie.options.maxAge,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    },
  };
}

export function createSupabaseClientForCookies(
  adapter: SupabaseCookieAdapter,
  { cookieWrites = "best-effort", source = process.env }: ServerClientOptions = {},
) {
  const { environment, supabaseUrl, supabaseKey } = requireRuntimeEnvironment(source);
  const secure = requiresSecureCookies(environment);

  return createServerClient(supabaseUrl, supabaseKey, {
    global: { fetch: authenticationFetch },
    auth: {
      detectSessionInUrl: false,
      persistSession: true,
    },
    cookies: {
      getAll: adapter.getAll,
      async setAll(cookiesToSet, headers) {
        try {
          await adapter.setAll(cookiesToSet.map((cookie) => secureCookie(cookie, secure)), headers);
        } catch (error) {
          if (cookieWrites === "required") {
            throw new Error("Écriture du cookie de session impossible", { cause: error });
          }
        }
      },
    },
  });
}

/**
 * Construit un client Supabase lié aux cookies de la requête EN COURS.
 *
 * Un client par rendu, jamais de singleton : un client partagé entre deux requêtes
 * partagerait leurs sessions. C'est la même règle que le client `pg`, pour la même raison.
 */
export async function createServerSupabaseClient(options: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  return createSupabaseClientForCookies(
    {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value, options: cookieOptions } of cookiesToSet) {
          cookieStore.set({ name, value, ...cookieOptions });
        }
      },
    },
    options,
  );
}

/**
 * Rend l'état de session après vérification par le serveur.
 *
 * Les erreurs 4xx correspondent à une session absente, expirée, forgée ou révoquée. Une panne
 * réseau, une erreur 5xx ou une configuration invalide produit `unavailable`, afin qu'une panne
 * du fournisseur ne soit jamais présentée comme une déconnexion de l'utilisateur.
 *
 * Ne lève jamais : la page privée choisit entre redirection et état indisponible sans rendre de
 * donnée privée dans aucun des deux cas.
 */
export async function getVerifiedSession(): Promise<VerifiedSession> {
  try {
    const supabase = await createServerSupabaseClient();
    // ⚠️ `getUser()` — voir l'en-tête. `getSession()` est PROSCRIT dans tout le module.
    const { data, error } = await supabase.auth.getUser();
    if (data?.user?.id) return { status: "authenticated", user: { id: data.user.id } };
    if (!error) return { status: "anonymous" };

    const status = (error as { status?: unknown }).status;
    const name = (error as { name?: unknown }).name;
    if (name === "AuthSessionMissingError" || (typeof status === "number" && status >= 400 && status < 500)) {
      return { status: "anonymous" };
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const session = await getVerifiedSession();
  return session.status === "authenticated" ? session.user : null;
}
