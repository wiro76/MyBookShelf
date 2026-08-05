import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  // TypeScript 7 is validated by the dedicated `npm run typecheck` command.
  // Next 16 cannot resolve the official TS6/TS7 side-by-side package layout during build.
  typescript: {
    ignoreBuildErrors: true,
  },
};

/**
 * `withSentryConfig` — story 1.4 (T4).
 *
 * Il ne sert QU'À l'outillage de build : téléversement des sourcemaps et instrumentation
 * des routes. L'initialisation du SDK, elle, vit dans `src/instrumentation.ts` et reste
 * conditionnée au DSN. `silent` et `sourcemaps.disable` évitent tout appel réseau et tout
 * bruit tant qu'aucun compte Sentry n'existe.
 *
 * Next 16 construit avec Turbopack, et Sentry 10 le supporte : `next build` passe (voir
 * la sortie de `npm run ci:static`). `disableLogger` n'est PAS repris — il est déprécié
 * au profit de `webpack.treeshake.removeDebugLogging`, lui-même sans effet sous Turbopack,
 * et il n'émettait ici qu'un avertissement de dépréciation à chaque build.
 *
 * `typescript.ignoreBuildErrors: true` est volontaire et indépendant : TypeScript 7 est
 * validé par `npm run typecheck`.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
