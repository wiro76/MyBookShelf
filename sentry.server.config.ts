import * as Sentry from "@sentry/nextjs";
import { correlationAttributes, sanitizeSentryEvent, sanitizeSentrySpan } from "@/shared/observability";

/**
 * Configuration Sentry — runtime Node — story 1.4 (T4, AC 2 ; AD-12, NFR-7).
 *
 * Chargée UNIQUEMENT par `src/instrumentation.ts`, et seulement quand
 * `process.env.NEXT_RUNTIME === "nodejs"`. Elle peut donc dépendre de code Node
 * (`@/shared/observability` remonte à `node:async_hooks` et `node:crypto`).
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * INITIALISATION CONDITIONNÉE AU DSN
 * ────────────────────────────────────────────────────────────────────────────────
 * Aucun compte Sentry n'existe. Sans `SENTRY_DSN`, `Sentry.init` n'est jamais appelé :
 * le SDK reste un no-op silencieux, aucune requête réseau n'est tentée, aucun avertissement
 * n'est écrit. Le jour où un DSN est fourni, rien d'autre ne change.
 */

const dsn = process.env.SENTRY_DSN;

/**
 * Taux d'échantillonnage des traces. `0` par défaut : sans collecteur, échantillonner ne
 * produirait que du coût. La valeur est lue à l'initialisation, jamais figée dans le code.
 */
function tracesSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV,
    tracesSampleRate: tracesSampleRate(),

    /**
     * `dataCollection`, et NON `sendDefaultPii` — déprécié depuis 10.54, supprimé en v11.
     * Tout ce qui peut porter une donnée d'exécution est fermé explicitement plutôt que
     * laissé au défaut : les défauts de la bibliothèque changent de version en version,
     * pas ce fichier. `stackFrameVariables: false` est le plus important du lot — les
     * variables locales d'une frame contiennent le contenu importé, l'adresse courriel ou
     * l'URL signée qu'on refuse de voir sortir. `frameContextLines` n'est pas touché : ce
     * sont des lignes de CODE SOURCE, pas des données.
     */
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

    /**
     * DERNIER FILET, à deux titres.
     *
     * 1. CONVERGENCE (AC 2) : `correlationAttributes()` est la fonction pure unique
     *    consommée par les trois sorties. Le logger la fusionne dans chaque ligne JSON ;
     *    ici, elle devient les tags de l'événement Sentry. Une erreur capturée pendant un
     *    Route Handler porte donc le même `requestId` et le même `jobId` que les journaux
     *    de la même exécution — c'est ce qui permet de passer d'un log à une trace.
     *    Hors contexte de corrélation, la fonction rend un objet vide : aucun tag inventé.
     *
     * 2. EXPURGATION : `dataCollection` ferme les collectes automatiques, mais rien
     *    n'empêche une intégration d'attacher une URL ou un identifiant utilisateur. On
     *    retire donc `user` et on réduit `request` au strict minimum, requête déquérée
     *    (une URL signée vit dans la query string, et c'est un accès en clair à un média
     *    privé — AD-10).
     */
    beforeSend(event) {
      try {
        return sanitizeSentryEvent(event, correlationAttributes());
      } catch {
        // Un événement impossible à expurger est abandonné : aucune remontée ne vaut mieux
        // qu'une remontée brute contenant l'incident privé que l'on refuse d'exfiltrer.
        return null;
      }
    },

    beforeSendSpan(span) {
      return sanitizeSentrySpan(span, correlationAttributes());
    },
  });
}
