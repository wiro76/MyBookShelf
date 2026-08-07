import type { CatalogSearchRequest } from "../application/catalog-provider";

function escapeQuotedTerm(term: string) {
  return term
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

export function encodeGoogleBooksQuery(mode: CatalogSearchRequest["mode"], term: string) {
  return `${mode === "title" ? "intitle" : "inauthor"}:"${escapeQuotedTerm(term)}"`;
}

export function encodeBnfCql(mode: CatalogSearchRequest["mode"], term: string) {
  return `bib.${mode} all "${escapeQuotedTerm(term)}"`;
}
