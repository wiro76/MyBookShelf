import { normalizeIsbn, type CandidateIdentifier, type Provenanced } from "../domain/normalized-candidate";

const MAX_TEXT = 500;
const MAX_DESCRIPTION = 10_000;
const MAX_LIST = 50;

export function boundedText(value: unknown, maximum = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

export function boundedDescription(value: unknown) {
  return boundedText(value, MAX_DESCRIPTION);
}

export function boundedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const values = value.map((item) => boundedText(item)).filter((item): item is string => Boolean(item));
  return [...new Set(values)].slice(0, MAX_LIST);
}

export function normalizeIsbnIdentifier(value: unknown): CandidateIdentifier | undefined {
  const text = boundedText(value, 128);
  if (!text) return undefined;
  const isbn = normalizeIsbn(text.replace(/^(?:urn:isbn:|isbn(?:-1[03])?\s*:?\s*)/i, ""));
  return isbn ? { scheme: "isbn-13", value: isbn } : undefined;
}

export function provenanced<T>(value: T, claimRef: string): Provenanced<T> {
  return { value, claimRefs: [claimRef] };
}
