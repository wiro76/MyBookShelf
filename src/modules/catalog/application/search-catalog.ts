import { logger as sharedLogger } from "@/shared/observability";
import { mergeCandidates, type CatalogProviderId, type NormalizedCandidate } from "../domain/normalized-candidate";
import type { CatalogProvider, CatalogProviderFailure, CatalogSearchOutcome, CatalogSearchRequest } from "./catalog-provider";

export type { CatalogProvider, CatalogSearchOutcome, CatalogSearchRequest } from "./catalog-provider";

const PROVIDERS: readonly CatalogProviderId[] = ["google-books", "open-library", "bnf"];
const MAX_QUERY_LENGTH = 200;
const MAX_PER_PROVIDER = 10;

type CatalogSearchLogFields = Readonly<{
  provider: CatalogProviderId;
  durationMs: number;
  outcome: "fulfilled" | "failed" | "timeout";
  count: number;
  correlationId: string;
}>;

export type CatalogSearchLogger = Readonly<{
  info(message: string, fields: CatalogSearchLogFields): void;
  warn(message: string, fields: CatalogSearchLogFields): void;
}>;

export type SearchCatalogDependencies = Readonly<{
  providers: readonly CatalogProvider[];
  correlationId?: string;
  logger?: CatalogSearchLogger;
  sourceTimeoutMs?: number;
  globalTimeoutMs?: number;
  signal?: AbortSignal;
  now?: () => number;
}>;

type ProviderResult = Readonly<{
  provider: CatalogProviderId;
  candidates?: readonly NormalizedCandidate[];
  failure?: CatalogProviderFailure;
}>;

class ProviderTimeoutError extends Error {}

export function normalizeCatalogSearchRequest(request: CatalogSearchRequest): CatalogSearchRequest | null {
  if (request?.mode !== "title" && request?.mode !== "author") return null;
  if (typeof request.query !== "string") return null;
  const query = request.query.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!query || query.length > MAX_QUERY_LENGTH) return null;
  return { mode: request.mode, query };
}

function positiveTimeout(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function logEvent(logger: CatalogSearchLogger | undefined, level: "info" | "warn", fields: CatalogSearchLogFields): void {
  const message = level === "info" ? "catalog provider completed" : "catalog provider failed";
  if (logger) {
    logger[level](message, fields);
    return;
  }
  sharedLogger[level](message, {
    provider: fields.provider,
    durationMs: fields.durationMs,
    outcome: fields.outcome,
    count: fields.count,
    requestId: fields.correlationId,
  });
}

async function callProvider(
  provider: CatalogProvider,
  request: CatalogSearchRequest,
  dependencies: SearchCatalogDependencies,
  globalSignal: AbortSignal,
  timeoutMs: number,
): Promise<ProviderResult> {
  const controller = new AbortController();
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const abortFromParent = () => controller.abort(globalSignal.reason);
  globalSignal.addEventListener("abort", abortFromParent, { once: true });
  if (globalSignal.aborted) abortFromParent();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new ProviderTimeoutError());
        controller.abort(new ProviderTimeoutError());
      }, timeoutMs);
    });
    if (controller.signal.aborted) throw new ProviderTimeoutError();
    const candidates = await Promise.race([provider.search(request, controller.signal), timeout]);
    if (controller.signal.aborted) throw new ProviderTimeoutError();
    const bounded = Object.freeze([...candidates].slice(0, MAX_PER_PROVIDER));
    logEvent(dependencies.logger, "info", {
      provider: provider.id,
      durationMs: Math.max(0, now() - startedAt),
      outcome: "fulfilled",
      count: bounded.length,
      correlationId: dependencies.correlationId ?? "catalog-search",
    });
    return { provider: provider.id, candidates: bounded };
  } catch (error) {
    const timedOut = error instanceof ProviderTimeoutError || globalSignal.aborted;
    logEvent(dependencies.logger, "warn", {
      provider: provider.id,
      durationMs: Math.max(0, now() - startedAt),
      outcome: timedOut ? "timeout" : "failed",
      count: 0,
      correlationId: dependencies.correlationId ?? "catalog-search",
    });
    return { provider: provider.id, failure: { provider: provider.id, code: timedOut ? "CATALOG_PROVIDER_TIMEOUT" : "CATALOG_PROVIDER_FAILED" } };
  } finally {
    if (timer) clearTimeout(timer);
    globalSignal.removeEventListener("abort", abortFromParent);
  }
}

export async function searchCatalog(request: CatalogSearchRequest, dependencies: SearchCatalogDependencies): Promise<CatalogSearchOutcome> {
  const normalized = normalizeCatalogSearchRequest(request);
  if (!normalized) return { status: "invalid", code: "CATALOG_QUERY_INVALID" };

  const byId = new Map(dependencies.providers.map((provider) => [provider.id, provider]));
  if (byId.size !== PROVIDERS.length || PROVIDERS.some((id) => !byId.has(id))) {
    throw new Error("Catalog providers are incomplete.");
  }

  const globalController = new AbortController();
  const abortExternal = () => globalController.abort(dependencies.signal?.reason);
  dependencies.signal?.addEventListener("abort", abortExternal, { once: true });
  if (dependencies.signal?.aborted) abortExternal();
  const globalTimeoutMs = positiveTimeout(dependencies.globalTimeoutMs, 5_000);
  const sourceTimeoutMs = Math.min(positiveTimeout(dependencies.sourceTimeoutMs, 3_000), globalTimeoutMs);
  const globalTimer = setTimeout(() => globalController.abort(new ProviderTimeoutError()), globalTimeoutMs);

  let results: readonly ProviderResult[];
  try {
    results = await Promise.all(PROVIDERS.map((id) => callProvider(byId.get(id) as CatalogProvider, normalized, dependencies, globalController.signal, sourceTimeoutMs)));
  } finally {
    clearTimeout(globalTimer);
    dependencies.signal?.removeEventListener("abort", abortExternal);
  }

  const fulfilled = results.filter((result) => result.candidates !== undefined);
  const failures = Object.freeze(results.flatMap((result) => result.failure ? [result.failure] : []));
  const candidates = mergeCandidates(fulfilled.flatMap((result) => result.candidates ?? []));
  const base = { query: normalized.query, mode: normalized.mode, candidates, failures } as const;
  if (fulfilled.length === 0) return { status: "unavailable", ...base };
  if (fulfilled.length < PROVIDERS.length) return { status: "partial", ...base };
  return candidates.length === 0 ? { status: "empty", ...base } : { status: "complete", ...base };
}
