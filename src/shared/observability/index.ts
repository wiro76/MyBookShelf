/**
 * Socle d'observabilité — story 1.4 (AD-12).
 *
 * Baril unique du dossier : `workers` et `app` importent `@/shared/observability`,
 * jamais un fichier isolé. Aucun effet de bord, aucune lecture d'environnement, rien de
 * construit au chargement — ce module est traversé par le build Next.
 */

export { createCorrelationId } from "./ids";
export {
  CORRELATION_KEYS,
  CORRELATION_VALUE_MAX_LENGTH,
  correlationAttributes,
  currentCorrelation,
  runWithCorrelation,
  withCorrelation,
} from "./context";
export type { CorrelationContext } from "./context";
export { pseudonymize, pseudonymizeActor } from "./pseudonymize";
export {
  DEFAULT_STABLE_ERROR_CODE,
  ERROR_MESSAGE_MAX_LENGTH,
  STABLE_ERROR_MARKER,
  UNEXPECTED_ERROR_CODE,
  describeError,
  toStableError,
} from "./errors";
export type { StableError } from "./errors";
export {
  LOG_LINE_MAX_BYTES,
  formatLogLine,
  logger,
} from "./logger";
export type { LogLevel } from "./logger";
export { REDACTION_PLACEHOLDER, TRUNCATION_SUFFIX, redactSensitiveText } from "./redaction";
export { sanitizeSentryEvent } from "./sentry";
