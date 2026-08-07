export const MAX_CATALOG_RESPONSE_BYTES = 1_048_576;

export class CatalogHttpError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CatalogHttpError";
    this.code = code;
  }
}

type ResponseOptions = {
  requestUrl: URL;
  allowedOrigins: ReadonlySet<string>;
  mediaType: "json" | "xml";
  maximumBytes?: number;
};

function assertAllowedUrl(url: URL, allowedOrigins: ReadonlySet<string>) {
  if (!allowedOrigins.has(url.origin)) throw new CatalogHttpError("CATALOG_ORIGIN_FORBIDDEN");
}

function hasExpectedMediaType(contentType: string, mediaType: ResponseOptions["mediaType"]) {
  const essence = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType === "json") return essence === "application/json" || essence?.endsWith("+json");
  return essence === "application/xml" || essence === "text/xml" || essence?.endsWith("+xml");
}

export async function readBoundedCatalogResponse(response: Response, options: ResponseOptions) {
  assertAllowedUrl(options.requestUrl, options.allowedOrigins);
  if (response.status >= 300 && response.status < 400) throw new CatalogHttpError("CATALOG_REDIRECT_FORBIDDEN");
  if (response.status !== 200) throw new CatalogHttpError("CATALOG_HTTP_STATUS");

  const finalUrl = response.url ? new URL(response.url) : options.requestUrl;
  assertAllowedUrl(finalUrl, options.allowedOrigins);
  if (!hasExpectedMediaType(response.headers.get("content-type") ?? "", options.mediaType)) {
    throw new CatalogHttpError("CATALOG_CONTENT_TYPE_INVALID");
  }

  const maximumBytes = options.maximumBytes ?? MAX_CATALOG_RESPONSE_BYTES;
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new CatalogHttpError("CATALOG_RESPONSE_TOO_LARGE");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new CatalogHttpError("CATALOG_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof CatalogHttpError) throw error;
    throw new CatalogHttpError("CATALOG_BODY_READ_FAILED");
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new CatalogHttpError("CATALOG_RESPONSE_INVALID");
  }
}

export async function fetchCatalogDocument(
  fetchImpl: typeof fetch,
  url: URL,
  signal: AbortSignal,
  mediaType: ResponseOptions["mediaType"],
  allowedOrigins: ReadonlySet<string>,
) {
  assertAllowedUrl(url, allowedOrigins);
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", redirect: "manual", signal, headers: { accept: mediaType === "json" ? "application/json" : "application/xml, text/xml" } });
  } catch {
    throw new CatalogHttpError("CATALOG_FETCH_FAILED");
  }
  return readBoundedCatalogResponse(response, { requestUrl: url, allowedOrigins, mediaType });
}
