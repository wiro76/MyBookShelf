import { createHash, timingSafeEqual } from "node:crypto";
import { readDeferredEffectsEnvironment, requireDeferredEffectsEnvironment } from "@/shared/config/environment";
import { getDatabasePool } from "@/shared/kernel";
import { createJobId, processDeferredEffects } from "@/workers/deferred-effects";

/**
 * Adaptateur HTTP du worker d'effets différés (AD-2 : aucune règle métier ici).
 * Il authentifie l'appelant, génère le `jobId` de l'exécution, délègue, sérialise.
 * Déclenché par Supabase Cron via `net.http_post`.
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

export async function POST(request: Request): Promise<Response> {
  const { workerSecret } = readDeferredEffectsEnvironment();
  if (!workerSecret) {
    console.error("DEFERRED_EFFECTS_WORKER_SECRET absent : aucun appel ne peut être autorisé.");
    return unauthorized();
  }
  if (!isAuthorized(request, workerSecret)) return unauthorized();

  const jobId = createJobId();
  try {
    requireDeferredEffectsEnvironment();
  } catch (error) {
    console.error("Configuration du worker d'effets différés invalide", { jobId, error });
    return Response.json({ jobId, error: "configuration_invalide" }, { status: 500 });
  }

  try {
    const result = await processDeferredEffects({ connection: getDatabasePool(), jobId });
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("Échec de l'exécution du worker d'effets différés", { jobId, error });
    return Response.json({ jobId, error: "execution_echouee" }, { status: 500 });
  }
}
