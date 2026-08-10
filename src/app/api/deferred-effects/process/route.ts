import { createHash, timingSafeEqual } from "node:crypto";
import { readDeferredEffectsEnvironment, requireDeferredEffectsEnvironment } from "@/shared/config/environment";
import { getDatabasePool } from "@/shared/kernel";
import { createCorrelationId, describeError, logger, runWithCorrelation, toStableError } from "@/shared/observability";
import { createJobId, processDeferredEffects } from "@/workers/deferred-effects";

/**
 * Adaptateur HTTP du worker d'effets différés (AD-2 : aucune règle métier ici).
 * Il authentifie l'appelant, génère le `jobId` de l'exécution, délègue, sérialise.
 * Déclenché par Supabase Cron via `net.http_post`.
 *
 * OBSERVABILITÉ (story 1.4) : c'est ICI qu'un contexte de corrélation est ouvert, et
 * nulle part ailleurs. `requestId` et `jobId` sont générés à l'entrée puis posés dans
 * l'`AsyncLocalStorage` : tout ce que journalise le worker en aval, à n'importe quelle
 * profondeur d'`await`, porte automatiquement les deux identifiants sans qu'aucune
 * fonction n'ait à les transporter. La frontière middleware → handler n'est jamais
 * traversée : son isolation n'est pas confirmée sur Next 16.
 *
 * Les réponses 500 passent par `toStableError` : ni texte, ni code fournisseur ne
 * franchit la frontière HTTP (AC 4). Le détail reste côté serveur, dans le journal, sous
 * le même `requestId`. Les chemins 200 et 401 sont INCHANGÉS — le canari outbox assert
 * dessus.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BEARER_PATTERN = /^Bearer (.+)$/;

function unauthorized(): Response {
  // 401 sans le moindre détail : ni motif, ni distinction « absent » / « invalide ».
  return new Response(null, { status: 401 });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function isAuthorized(request: Request, expectedSecret: string): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;
  const presented = BEARER_PATTERN.exec(header)?.[1];
  if (!presented) return false;
  // Comparaison à temps constant sur des condensats, donc de longueur fixe.
  return timingSafeEqual(digest(presented), digest(expectedSecret));
}

const ROUTE_NAME = "api/deferred-effects/process";

async function handle(request: Request, jobId: string): Promise<Response> {
  const { workerSecret } = readDeferredEffectsEnvironment();
  if (!workerSecret) {
    logger.error("DEFERRED_EFFECTS_WORKER_SECRET absent : aucun appel ne peut être autorisé.", {
      operation: ROUTE_NAME,
      outcome: "unauthorized",
      reason: "worker_secret_absent",
    });
    return unauthorized();
  }
  if (!isAuthorized(request, workerSecret)) return unauthorized();

  try {
    requireDeferredEffectsEnvironment();
  } catch (error) {
    // Le texte d'origine — qui nomme la variable fautive, parfois la chaîne de connexion —
    // reste ici, dans le journal expurgé. La réponse, elle, ne porte que le code stable.
    logger.error("Configuration du worker d'effets différés invalide", {
      jobId,
      operation: ROUTE_NAME,
      outcome: "configuration_invalide",
      ...describeError(error),
    });
    const stable = toStableError(error, "configuration_invalide");
    return Response.json({ jobId, error: stable.code, message: stable.message }, { status: 500 });
  }

  try {
    const result = await processDeferredEffects({ connection: getDatabasePool(), jobId });
    return Response.json(result, { status: 200 });
  } catch (error) {
    logger.error("Échec de l'exécution du worker d'effets différés", {
      jobId,
      operation: ROUTE_NAME,
      outcome: "execution_echouee",
      ...describeError(error),
    });
    const stable = toStableError(error, "execution_echouee");
    return Response.json({ jobId, error: stable.code, message: stable.message }, { status: 500 });
  }
}

export function POST(request: Request): Promise<Response> {
  // `requestId` identifie l'APPEL HTTP, `jobId` l'EXÉCUTION du worker. Ils sont distincts :
  // un rejeu manuel produirait un autre `requestId` pour un même `jobId` transmis.
  // Tous deux sont posés avant le premier `await`, donc avant toute journalisation.
  const requestId = createCorrelationId();
  const jobId = createJobId();
  return runWithCorrelation({ requestId, jobId }, () => handle(request, jobId));
}
