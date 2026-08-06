import type { CorrelationContext } from "./context";
import { sanitizeCorrelationContext } from "./context";
import { REDACTION_PLACEHOLDER, redactSensitiveText } from "./redaction";

type MutableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeRequest(request: unknown): MutableRecord | undefined {
  if (!isRecord(request)) return undefined;
  const method = typeof request.method === "string" ? redactSensitiveText(request.method) : undefined;
  const url = typeof request.url === "string" ? redactSensitiveText(request.url.split("?")[0]) : undefined;
  return method || url ? { method, url } : undefined;
}

function sanitizeStacktrace(stacktrace: unknown): MutableRecord | undefined {
  if (!isRecord(stacktrace) || !Array.isArray(stacktrace.frames)) return undefined;
  return {
    frames: stacktrace.frames.map((frame: unknown) => {
      if (!isRecord(frame)) return {};
      return {
        filename: typeof frame.filename === "string" ? redactSensitiveText(frame.filename) : undefined,
        function: typeof frame.function === "string" ? redactSensitiveText(frame.function) : undefined,
        lineno: typeof frame.lineno === "number" ? frame.lineno : undefined,
        colno: typeof frame.colno === "number" ? frame.colno : undefined,
        in_app: typeof frame.in_app === "boolean" ? frame.in_app : undefined,
      };
    }),
  };
}

function sanitizeException(exception: unknown): MutableRecord {
  if (!isRecord(exception)) return { value: REDACTION_PLACEHOLDER };
  return {
    type: typeof exception.type === "string" ? redactSensitiveText(exception.type) : undefined,
    value: REDACTION_PLACEHOLDER,
    mechanism: isRecord(exception.mechanism)
      ? {
          type: typeof exception.mechanism["type"] === "string" ? redactSensitiveText(exception.mechanism["type"]) : undefined,
          handled: typeof exception.mechanism["handled"] === "boolean" ? exception.mechanism["handled"] : undefined,
        }
      : undefined,
    stacktrace: sanitizeStacktrace(exception.stacktrace),
  };
}

export function sanitizeSentryEvent<T extends object>(event: T, correlation: CorrelationContext = {}): T {
  const sanitized: MutableRecord = {
    ...(event as MutableRecord),
    tags: sanitizeCorrelationContext(correlation),
  };

  delete sanitized.user;
  delete sanitized.extra;
  delete sanitized.contexts;
  delete sanitized.breadcrumbs;
  delete sanitized.sdkProcessingMetadata;
  delete sanitized.logentry;

  if (typeof sanitized.message === "string") sanitized.message = REDACTION_PLACEHOLDER;
  if (isRecord(sanitized.exception) && Array.isArray(sanitized.exception.values)) {
    sanitized.exception = { values: sanitized.exception.values.map(sanitizeException) };
  }
  const request = sanitizeRequest(sanitized.request);
  if (request) sanitized.request = request;
  else delete sanitized.request;

  return sanitized as T;
}
