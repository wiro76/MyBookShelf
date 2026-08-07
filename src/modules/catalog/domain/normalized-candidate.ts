import { createHash } from "node:crypto";

export type CatalogProviderId = "google-books" | "open-library" | "bnf" | "manual";
export type CandidateKind = "work-with-editions" | "edition-only";

export type SourceClaim = Readonly<{
  claimRef: string;
  provider: CatalogProviderId;
  sourceId: string;
  fingerprintSha256: string;
  collectedAt: string;
  rights: Readonly<{ status: "known" | "unknown"; label?: string; url?: string }>;
}>;

export type Provenanced<T> = Readonly<{ value: T; claimRefs: readonly string[] }>;
export type CandidateIdentifier = Readonly<{ scheme: "isbn-10" | "isbn-13" | "other"; value: string }>;

export type EditionCandidate = Readonly<{
  editionRef: string;
  title: Provenanced<string>;
  publicationDate?: Provenanced<string>;
  pageCount?: Provenanced<number>;
  languages: readonly Provenanced<string>[];
  identifiers: readonly Provenanced<CandidateIdentifier>[];
}>;

export type NormalizedCandidate = Readonly<{
  candidateRef: string;
  primaryClaim: SourceClaim;
  candidateKind: CandidateKind;
  title: Provenanced<string>;
  subtitle?: Provenanced<string>;
  authors: readonly Provenanced<string>[];
  description?: Provenanced<string>;
  languages: readonly Provenanced<string>[];
  publicationDate?: Provenanced<string>;
  identifiers: readonly Provenanced<CandidateIdentifier>[];
  editions: readonly EditionCandidate[];
  sources: readonly SourceClaim[];
}>;

type CandidateInput = Readonly<{
  primaryClaimRef: string;
  sources: readonly SourceClaim[];
  candidateKind?: CandidateKind;
  title: Provenanced<string>;
  subtitle?: Provenanced<string>;
  authors?: readonly Provenanced<string>[];
  description?: Provenanced<string>;
  languages?: readonly Provenanced<string>[];
  publicationDate?: Provenanced<string>;
  identifiers?: readonly Provenanced<CandidateIdentifier>[];
  editions?: readonly EditionCandidate[];
}>;

const PROVIDER_PRIORITY: Readonly<Record<CatalogProviderId, number>> = {
  "google-books": 0,
  "open-library": 1,
  bnf: 2,
  manual: 3,
};
const MAX_TEXT = 500;
const MAX_DESCRIPTION = 10_000;
const MAX_LIST = 50;
const MAX_CANDIDATES = 25;
const MAX_PROJECTION_BYTES = 64 * 1024;

export class CatalogCandidateError extends Error {
  readonly code = "CATALOG_CANDIDATE_INVALID";

  constructor() {
    super("Le candidat catalogue est invalide.");
    this.name = "CatalogCandidateError";
  }
}

function invalid(): never {
  throw new CatalogCandidateError();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") invalid();
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > max) invalid();
  return normalized;
}

function canonicalize(value: unknown, depth = 0): unknown {
  if (depth > 16) invalid();
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return value;
  }
  if (typeof value === "string") return normalizeText(value, MAX_DESCRIPTION);
  if (Array.isArray(value)) {
    if (value.length > 100) invalid();
    return value.map((entry) => canonicalize(entry, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter((entry) => entry[1] !== undefined);
    if (entries.length > 100) invalid();
    return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalize(entry, depth + 1)]));
  }
  invalid();
}

export function createSourceClaim(input: Readonly<{
  provider: CatalogProviderId;
  sourceId: string;
  projection: unknown;
  collectedAt: string;
  rights: SourceClaim["rights"];
}>): SourceClaim {
  if (!(input.provider in PROVIDER_PRIORITY)) invalid();
  const sourceId = normalizeText(input.sourceId);
  const collectedAt = new Date(input.collectedAt);
  if (!Number.isFinite(collectedAt.getTime()) || collectedAt.toISOString() !== input.collectedAt) invalid();
  const projection = JSON.stringify(canonicalize(input.projection));
  if (Buffer.byteLength(projection, "utf8") > MAX_PROJECTION_BYTES) invalid();
  const rights = input.rights?.status === "known"
    ? { status: "known" as const, ...(input.rights.label ? { label: normalizeText(input.rights.label) } : {}), ...(input.rights.url ? { url: normalizeText(input.rights.url, 2_048) } : {}) }
    : input.rights?.status === "unknown" ? { status: "unknown" as const } : invalid();
  const fingerprintSha256 = sha256(projection);
  return Object.freeze({
    claimRef: `claim_${sha256(`${input.provider}\0${sourceId}\0${fingerprintSha256}`)}`,
    provider: input.provider,
    sourceId,
    fingerprintSha256,
    collectedAt: input.collectedAt,
    rights: Object.freeze(rights),
  });
}

export function normalizeIsbn(value: string): string | null {
  const compact = value.replace(/[\s-]/gu, "").toUpperCase();
  if (/^\d{9}[\dX]$/u.test(compact)) {
    const sum = [...compact].reduce((total, character, index) => total + (character === "X" ? 10 : Number(character)) * (10 - index), 0);
    if (sum % 11 !== 0) return null;
    return toIsbn13(compact);
  }
  if (/^\d{13}$/u.test(compact)) {
    const sum = [...compact.slice(0, 12)].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(compact[12]) ? compact : null;
  }
  return null;
}

function toIsbn13(isbn10: string): string {
  const prefix = `978${isbn10.slice(0, 9)}`;
  const sum = [...prefix].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
  return `${prefix}${(10 - (sum % 10)) % 10}`;
}

function normalizeClaimRefs(claimRefs: readonly string[], known: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(claimRefs) || claimRefs.length === 0 || claimRefs.length > MAX_LIST) invalid();
  const refs = [...new Set(claimRefs.map((ref) => normalizeText(ref)))].sort();
  if (refs.some((ref) => !known.has(ref))) invalid();
  return Object.freeze(refs);
}

function textValue(field: Provenanced<string>, known: ReadonlySet<string>, max = MAX_TEXT): Provenanced<string> {
  return Object.freeze({ value: normalizeText(field?.value, max), claimRefs: normalizeClaimRefs(field?.claimRefs, known) });
}

function identifierValue(field: Provenanced<CandidateIdentifier>, known: ReadonlySet<string>): Provenanced<CandidateIdentifier> {
  const scheme = field?.value?.scheme;
  if (scheme !== "isbn-10" && scheme !== "isbn-13" && scheme !== "other") invalid();
  const raw = normalizeText(field.value.value);
  const isbn = scheme.startsWith("isbn-") ? normalizeIsbn(raw) : null;
  if (scheme.startsWith("isbn-") && !isbn) invalid();
  return Object.freeze({
    value: Object.freeze(isbn ? { scheme: "isbn-13" as const, value: isbn } : { scheme, value: raw }),
    claimRefs: normalizeClaimRefs(field.claimRefs, known),
  });
}

function bounded<T>(values: readonly T[] | undefined): readonly T[] {
  if (!values) return Object.freeze([]);
  if (!Array.isArray(values) || values.length > MAX_LIST) invalid();
  return values;
}

function normalizeEdition(edition: EditionCandidate, known: ReadonlySet<string>): EditionCandidate {
  return Object.freeze({
    editionRef: normalizeText(edition.editionRef),
    title: textValue(edition.title, known),
    ...(edition.publicationDate ? { publicationDate: textValue(edition.publicationDate, known) } : {}),
    ...(edition.pageCount ? {
      pageCount: Object.freeze({
        value: Number.isSafeInteger(edition.pageCount.value) && edition.pageCount.value > 0 ? edition.pageCount.value : invalid(),
        claimRefs: normalizeClaimRefs(edition.pageCount.claimRefs, known),
      }),
    } : {}),
    languages: Object.freeze(bounded(edition.languages).map((value) => textValue(value, known))),
    identifiers: Object.freeze(bounded(edition.identifiers).map((value) => identifierValue(value, known))),
  });
}

export function createNormalizedCandidate(input: CandidateInput): NormalizedCandidate {
  if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > MAX_LIST) invalid();
  const uniqueSources: SourceClaim[] = [...new Map<string, SourceClaim>(input.sources.map((source) => [source.claimRef, source])).values()];
  const known = new Set(uniqueSources.map((source) => source.claimRef));
  const primaryClaim = uniqueSources.find((source) => source.claimRef === input.primaryClaimRef);
  if (!primaryClaim) invalid();
  const minimumPriority = Math.min(...uniqueSources.map((source) => PROVIDER_PRIORITY[source.provider]));
  if (PROVIDER_PRIORITY[primaryClaim.provider] !== minimumPriority) invalid();
  const kind = input.candidateKind ?? "edition-only";
  if (kind !== "edition-only" && kind !== "work-with-editions") invalid();
  const candidate = {
    candidateRef: `candidate_${sha256(`${primaryClaim.provider}\0${primaryClaim.sourceId}`)}`,
    primaryClaim,
    candidateKind: kind,
    title: textValue(input.title, known),
    ...(input.subtitle ? { subtitle: textValue(input.subtitle, known) } : {}),
    authors: Object.freeze(bounded(input.authors).map((value) => textValue(value, known))),
    ...(input.description ? { description: textValue(input.description, known, MAX_DESCRIPTION) } : {}),
    languages: Object.freeze(bounded(input.languages).map((value) => textValue(value, known))),
    ...(input.publicationDate ? { publicationDate: textValue(input.publicationDate, known) } : {}),
    identifiers: Object.freeze(bounded(input.identifiers).map((value) => identifierValue(value, known))),
    editions: Object.freeze(bounded(input.editions).map((edition) => normalizeEdition(edition, known))),
    sources: Object.freeze(uniqueSources),
  } as const;
  const usedClaims = new Set<string>();
  const retain = (field: Provenanced<unknown> | undefined) => field?.claimRefs.forEach((ref) => usedClaims.add(ref));
  retain(candidate.title);
  retain(candidate.subtitle);
  candidate.authors.forEach(retain);
  retain(candidate.description);
  candidate.languages.forEach(retain);
  retain(candidate.publicationDate);
  candidate.identifiers.forEach(retain);
  for (const edition of candidate.editions) {
    retain(edition.title);
    retain(edition.publicationDate);
    retain(edition.pageCount);
    edition.languages.forEach(retain);
    edition.identifiers.forEach(retain);
  }
  if (uniqueSources.some((source) => !usedClaims.has(source.claimRef))) invalid();
  return Object.freeze(candidate);
}

function exactKeys(candidate: NormalizedCandidate): Set<string> {
  const keys = new Set(candidate.sources.map((source) => `source:${source.provider}:${source.sourceId}`));
  for (const identifier of candidate.identifiers) {
    if (identifier.value.scheme === "isbn-13") keys.add(`isbn:${identifier.value.value}`);
  }
  for (const edition of candidate.editions) {
    for (const identifier of edition.identifiers) if (identifier.value.scheme === "isbn-13") keys.add(`isbn:${identifier.value.value}`);
  }
  return keys;
}

function canMerge(left: NormalizedCandidate, right: NormalizedCandidate): boolean {
  const rightKeys = exactKeys(right);
  return [...exactKeys(left)].some((key) => rightKeys.has(key));
}

function mergeProvenancedList<T>(left: readonly Provenanced<T>[], right: readonly Provenanced<T>[], key: (value: T) => string): readonly Provenanced<T>[] {
  const merged = new Map<string, Provenanced<T>>();
  for (const item of [...left, ...right]) {
    const itemKey = key(item.value);
    const existing = merged.get(itemKey);
    merged.set(itemKey, Object.freeze({ value: existing?.value ?? item.value, claimRefs: Object.freeze([...new Set([...(existing?.claimRefs ?? []), ...item.claimRefs])].sort()) }));
  }
  return Object.freeze([...merged.values()].slice(0, MAX_LIST));
}

function editionKeys(edition: EditionCandidate): ReadonlySet<string> {
  const keys = new Set([`edition:${edition.editionRef}`]);
  for (const identifier of edition.identifiers) {
    if (identifier.value.scheme === "isbn-13") keys.add(`isbn:${identifier.value.value}`);
  }
  return keys;
}

function mergeEditionList(left: readonly EditionCandidate[], right: readonly EditionCandidate[]): readonly EditionCandidate[] {
  const output: EditionCandidate[] = [];
  for (const edition of [...left, ...right]) {
    const keys = editionKeys(edition);
    const index = output.findIndex((existing) => [...editionKeys(existing)].some((key) => keys.has(key)));
    if (index < 0) {
      output.push(edition);
      continue;
    }
    const existing = output[index];
    const mergeText = (first: Provenanced<string> | undefined, second: Provenanced<string> | undefined) => {
      if (!first) return second;
      if (!second || first.value !== second.value) return first;
      return Object.freeze({ value: first.value, claimRefs: Object.freeze([...new Set([...first.claimRefs, ...second.claimRefs])].sort()) });
    };
    output[index] = Object.freeze({
      editionRef: existing.editionRef,
      title: mergeText(existing.title, edition.title) as Provenanced<string>,
      ...(mergeText(existing.publicationDate, edition.publicationDate) ? { publicationDate: mergeText(existing.publicationDate, edition.publicationDate) } : {}),
      ...(existing.pageCount ?? edition.pageCount ? { pageCount: existing.pageCount ?? edition.pageCount } : {}),
      languages: mergeProvenancedList(existing.languages, edition.languages, (value) => value.toLocaleLowerCase("und")),
      identifiers: mergeProvenancedList(existing.identifiers, edition.identifiers, (value) => `${value.scheme}:${value.value}`),
    });
  }
  return Object.freeze(output.slice(0, MAX_LIST));
}

function mergePair(left: NormalizedCandidate, right: NormalizedCandidate): NormalizedCandidate {
  const primary = PROVIDER_PRIORITY[left.primaryClaim.provider] <= PROVIDER_PRIORITY[right.primaryClaim.provider] ? left : right;
  const secondary = primary === left ? right : left;
  const sources = [...new Map([...left.sources, ...right.sources].map((source) => [source.claimRef, source])).values()];
  const mergeSingle = (first: Provenanced<string> | undefined, second: Provenanced<string> | undefined) => {
    if (!first) return second;
    if (!second || first.value !== second.value) return first;
    return { value: first.value, claimRefs: [...new Set([...first.claimRefs, ...second.claimRefs])] };
  };
  const fields = {
    primaryClaimRef: primary.primaryClaim.claimRef,
    sources,
    candidateKind: (left.candidateKind === "work-with-editions" || right.candidateKind === "work-with-editions" ? "work-with-editions" : "edition-only") as CandidateKind,
    title: mergeSingle(primary.title, secondary.title) as Provenanced<string>,
    subtitle: mergeSingle(primary.subtitle, secondary.subtitle),
    authors: mergeProvenancedList(left.authors, right.authors, (value) => value.toLocaleLowerCase("und")),
    description: mergeSingle(primary.description, secondary.description),
    languages: mergeProvenancedList(left.languages, right.languages, (value) => value.toLocaleLowerCase("und")),
    publicationDate: mergeSingle(primary.publicationDate, secondary.publicationDate),
    identifiers: mergeProvenancedList(left.identifiers, right.identifiers, (value) => `${value.scheme}:${value.value}`),
    editions: mergeEditionList(left.editions, right.editions),
  };
  const usedClaims = new Set<string>();
  const retain = (field: Provenanced<unknown> | undefined) => field?.claimRefs.forEach((ref) => usedClaims.add(ref));
  retain(fields.title);
  retain(fields.subtitle);
  fields.authors.forEach(retain);
  retain(fields.description);
  fields.languages.forEach(retain);
  retain(fields.publicationDate);
  fields.identifiers.forEach(retain);
  for (const edition of fields.editions) {
    retain(edition.title);
    retain(edition.publicationDate);
    retain(edition.pageCount);
    edition.languages.forEach(retain);
    edition.identifiers.forEach(retain);
  }
  return createNormalizedCandidate({ ...fields, sources: sources.filter((source) => usedClaims.has(source.claimRef)) });
}

export function mergeCandidates(input: readonly NormalizedCandidate[], limit = MAX_CANDIDATES): readonly NormalizedCandidate[] {
  const ordered = input.map((candidate, index) => ({ candidate, index })).sort((left, right) =>
    PROVIDER_PRIORITY[left.candidate.primaryClaim.provider] - PROVIDER_PRIORITY[right.candidate.primaryClaim.provider] || left.index - right.index,
  );
  const output: NormalizedCandidate[] = [];
  for (const { candidate } of ordered) {
    const indexes = output.flatMap((existing, index) => canMerge(existing, candidate) ? [index] : []);
    if (indexes.length === 0) {
      output.push(candidate);
      continue;
    }
    const insertionIndex = indexes[0];
    const merged = indexes.reduce((current, index) => mergePair(output[index], current), candidate);
    for (const index of [...indexes].reverse()) output.splice(index, 1);
    output.splice(insertionIndex, 0, merged);
  }
  return Object.freeze(output.slice(0, Math.max(0, Math.min(limit, MAX_CANDIDATES))));
}
