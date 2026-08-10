import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CATALOG_ROOT = resolve(ROOT, "src/modules/catalog");

function filesBelow(directory, extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json"])) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(path, extensions);
    return extensions.has(extname(entry.name)) ? [path] : [];
  });
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

test("le module catalogue ne depend d'aucun acces DB, repository canonique ou mutation", () => {
  const forbidden = /(?:^|\/)(?:pg|postgres(?:ql)?|supabase|database|db|repository|repositories|mutation|mutations|authenticated-transaction|pool)(?:$|\/|-)/iu;
  const violations = [];

  for (const file of filesBelow(CATALOG_ROOT, new Set([".ts", ".tsx"]))) {
    const source = readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (forbidden.test(specifier)) {
        violations.push(`${relative(ROOT, file)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, [], `dependances interdites:\n${violations.join("\n")}`);
});

test("le catalogue ne contient aucune ecriture SQL ou commande de mutation", () => {
  const forbiddenOperations = [
    /\b(?:insert\s+into|update\s+[^\s]+\s+set|delete\s+from|merge\s+into)\b/iu,
    /\bauthenticatedTransaction\b/u,
  ];
  const violations = [];

  for (const file of filesBelow(CATALOG_ROOT, new Set([".ts", ".tsx"]))) {
    const source = readFileSync(file, "utf8");
    for (const pattern of forbiddenOperations) {
      if (pattern.test(source)) violations.push(`${relative(ROOT, file)} correspond a ${pattern}`);
    }
  }

  assert.deepEqual(violations, [], `operations interdites:\n${violations.join("\n")}`);
});

test("aucun code, configuration ou fixture catalogue ne cible Amazon", () => {
  const roots = [
    CATALOG_ROOT,
    resolve(ROOT, "src/shared/config/environment.ts"),
    resolve(ROOT, ".env.example"),
    resolve(ROOT, "tests/e2e/faux-service-catalogue.mjs"),
  ];
  const amazonTarget = /(?:amazon(?:aws)?|amzn|product[\s_-]*advertising)/iu;
  const violations = [];

  for (const root of roots) {
    if (!statSync(root).isDirectory()) {
      if (amazonTarget.test(readFileSync(root, "utf8"))) violations.push(relative(ROOT, root));
      continue;
    }
    for (const file of filesBelow(root)) {
      if (amazonTarget.test(readFileSync(file, "utf8"))) violations.push(relative(ROOT, file));
    }
  }

  assert.deepEqual(violations, [], `cibles Amazon detectees:\n${violations.join("\n")}`);
});
