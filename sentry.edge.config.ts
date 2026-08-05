import * as Sentry from "@sentry/nextjs";

/**
 * Configuration Sentry — runtime Edge — story 1.4 (T4).
 *
 * Chargée UNIQUEMENT par `src/instrumentation.ts` quand `process.env.NEXT_RUNTIME === "edge"`.
 * Le projet n'a aujourd'hui ni middleware ni route Edge — le Route Handler d'effets
 * différés déclare `runtime = "nodejs"` — mais le hook est branché pour les deux runtimes
 * afin qu'une future route Edge ne parte pas sans observabilité.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER N'IMPORTE PAS `@/shared/observability`
 * ────────────────────────────────────────────────────────────────────────────────
 * Le baril d'observabilité remonte à `node:async_hooks` (contexte) et `node:crypto`
 * (pseudonymisation HMAC), deux modules dont la disponibilité n'est pas garantie sur le
 * runtime Edge. L'y importer ferait échouer le bundle Edge — et la corrélation
 * `AsyncLocalStorage` n'y serait de toute façon pas alimentée : elle est ouverte dans un
 * Route Handler Node, jamais franchie de frontière. Les tags de corrélation sont donc
 * absents des événements Edge, et c'est assumé plutôt que simulé.
 *
 * Next propage nativement le contexte de trace entrant depuis la 13.4 ; les spans
 * personnalisés, eux, ne sont pas supportés sur Edge.
 */

const dsn = process.env.SENTRY_DSN;

function tracesSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV,
    tracesSampleRate: tracesSampleRate(),

    /** Mêmes fermetures que la configuration Node : voir `sentry.server.config.ts`. */
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },

    beforeSend(event) {
      try {
        delete event.user;
        if (event.request) {
          const url = typeof event.request.url === "string" ? event.request.url.split("?")[0] : undefined;
          event.request = { method: event.request.method, url };
        }
      } catch {
        // Voir `sentry.server.config.ts` : un événement mal formé ne bloque pas l'envoi.
      }
      return event;
    },
  });
}
