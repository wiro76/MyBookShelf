import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseClientForCookies } from "@/modules/identity/application/session";

/**
 * Rafraîchit la session avant le rendu afin que les Server Components lisent toujours les
 * jetons que la réponse va rendre persistants. Supabase utilise des refresh tokens à usage
 * unique : les cookies doivent donc être mis à jour à la fois sur la requête courante et sur
 * la réponse envoyée au navigateur.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  try {
    const supabase = createSupabaseClientForCookies(
      {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);

          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        },
      },
      { cookieWrites: "required" },
    );

    // Cet appel déclenche le rafraîchissement éventuel et vérifie le jeton côté serveur.
    await supabase.auth.getUser();
  } catch {
    // Une panne d'authentification ne doit pas empêcher le rendu des routes publiques. La page
    // privée distingue ensuite explicitement session absente et service indisponible.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
