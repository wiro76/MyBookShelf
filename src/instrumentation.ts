import * as Sentry from "@sentry/nextjs";

/**
 * Hook d'instrumentation Next — story 1.4 (T4, AC 2 ; AD-12).
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST DANS `src/` ET NON À LA RACINE
 * ────────────────────────────────────────────────────────────────────────────────
 * Le projet utilise `--src-dir`. Next cherche alors `src/instrumentation.ts` ; posé à la
 * racine, le fichier ne serait JAMAIS chargé — silencieusement, sans erreur, sans
 * qu'aucune porte CI ne s'en aperçoive. Jamais dans `app/`.
 *
 * `register()` est appelé une fois par instance serveur, avant toute requête.
 * `onRequestError` reçoit les erreurs serveur non gérées des Server Components, Route
 * Handlers et Server Actions.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * AUCUN COMPTE SENTRY N'EXISTE : TOUT EST CONDITIONNÉ AU DSN
 * ────────────────────────────────────────────────────────────────────────────────
 * Sans `SENTRY_DSN`, `Sentry.init` n'est jamais appelé (voir `sentry.server.config.ts`)
 * et le SDK reste un no-op silencieux : `captureRequestError` sans client initialisé ne
 * fait rien et ne lève pas. Aucune variable d'environnement nouvelle n'est donc requise
 * pour que le build et l'exécution passent.
 *
 * `@vercel/otel` n'est **pas** installé, délibérément : `@sentry/nextjs` 10 embarque et
 * initialise son propre SDK OpenTelemetry. Monter les deux produit un double tracer
 * provider dont l'un perd le contexte — c'est-à-dire exactement la garantie que l'AC 2
 * demande de tenir.
 */

/**
 * Le test `process.env.NEXT_RUNTIME === "…"` n'est pas une simple garde d'exécution :
 * Next substitue cette variable par un littéral au build, runtime par runtime. La branche
 * inerte disparaît donc du bundle, et avec elle son `import()`. C'est ce qui permet à la
 * configuration serveur d'importer du code Node (`node:crypto`, `node:async_hooks`) sans
 * jamais être tirée dans le bundle Edge.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/**
 * Forme exacte de la requête telle que Next la passe au hook. `headers` n'est PAS
 * transmis à autre chose qu'à Sentry, dont la collecte d'en-têtes est fermée par
 * `dataCollection` : un en-tête `authorization` ou `cookie` ne doit jamais être journalisé.
 */
type RequestInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

/**
 * Contexte Next. Les trois premiers champs sont ceux que Sentry consomme ; les trois
 * derniers sont fournis par Next et transmis tels quels. Volontairement typés en `string`
 * plutôt qu'en unions littérales : une valeur nouvelle introduite par une version
 * ultérieure de Next ne doit pas casser la porte `types`.
 */
type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
  renderType?: string;
};

/**
 * `error` est `unknown` et le restera : React a pu retraiter l'erreur d'origine, auquel cas
 * seul son `digest` subsiste. On ne tente donc rien d'autre que de la transmettre — la
 * décrire ici reviendrait à dupliquer `describeError` sur un objet déjà dénaturé.
 *
 * Ne lève jamais : une exception dans le hook d'erreurs masquerait l'erreur qu'il observe.
 */
export function onRequestError(error: unknown, request: RequestInfo, context: RequestErrorContext): void {
  try {
    Sentry.captureRequestError(error, request, context);
  } catch {
    // Sentry indisponible ou non initialisé : on ne fait pas d'un défaut d'observabilité
    // un incident de production.
  }
}
