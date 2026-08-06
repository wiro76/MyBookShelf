/** Suffixe apposé à toute valeur raccourcie, pour qu'une lecture ne se trompe pas. */
export const TRUNCATION_SUFFIX = "…[tronqué]";

/** Marqueur substitué à un fragment reconnu comme sensible. */
export const REDACTION_PLACEHOLDER = "[expurgé]";

/**
 * Motifs à haut risque, du plus spécifique au plus général.
 * Tous les quantificateurs sont bornés pour éviter une rétrogradation quadratique.
 */
export const REDACTION_PATTERNS: ReadonlyArray<RegExp> = [
  /[\w!#$%&'*+/=?^`{|}~.-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g,
  /\b[a-z][a-z0-9+.-]{0,31}:\/\/\S{1,2048}/gi,
  /\beyJ[A-Za-z0-9_-]{4,2048}\.[A-Za-z0-9_-]{4,2048}\.[A-Za-z0-9_-]{0,2048}/g,
  /\b[A-Za-z0-9_-]{40,4096}\b/g,
];

const REDACTION_OUTPUT_MAX_LENGTH = 8192;

export function redactSensitiveText(value: string): string {
  let redacted = value;
  for (const pattern of REDACTION_PATTERNS) redacted = redacted.replace(pattern, REDACTION_PLACEHOLDER);
  return redacted.length > REDACTION_OUTPUT_MAX_LENGTH
    ? `${redacted.slice(0, REDACTION_OUTPUT_MAX_LENGTH)}${TRUNCATION_SUFFIX}`
    : redacted;
}
