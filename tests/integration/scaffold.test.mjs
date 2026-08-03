import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

test("le scaffold utilise les versions et options canoniques", () => {
  const packageJson = readJson("package.json");
  const tsconfig = readJson("tsconfig.json");

  assert.equal(packageJson.engines.node, "24.18.0");
  assert.equal(packageJson.dependencies.next, "16.2.12");
  assert.equal(packageJson.dependencies.react, "19.2.8");
  assert.equal(packageJson.dependencies["react-dom"], "19.2.8");
  assert.equal(packageJson.devDependencies.typescript, "6.0.2");
  assert.equal(packageJson.devDependencies.typescript7, "npm:typescript@7.0.2");
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.deepEqual(tsconfig.compilerOptions.paths["@/*"], ["./src/*"]);
});

test("la graine hexagonale est présente", () => {
  const modules = ["identity", "library", "reading", "catalog", "media", "economy"];
  const layers = ["domain", "application", "adapters"];

  for (const moduleName of modules) {
    for (const layer of layers) {
      assert.equal(statSync(`src/modules/${moduleName}/${layer}`).isDirectory(), true);
    }
  }

  for (const path of [
    "src/shared/kernel",
    "src/shared/observability",
    "src/workers",
    "supabase/migrations",
    "tests/e2e",
  ]) {
    assert.equal(statSync(path).isDirectory(), true);
  }
});

test("la page initiale reste utile, française et sans faux livre", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const page = readFileSync("src/app/page.tsx", "utf8");
  const loading = readFileSync("src/app/loading.tsx", "utf8");
  const styles = readFileSync("src/app/globals.css", "utf8");

  assert.match(layout, /<html lang="fr"/);
  assert.match(page, /My BookShelf/);
  assert.match(page, /Voir l’état du projet/);
  assert.doesNotMatch(`${page}\n${loading}`, /<article|className=["'][^"']*book/i);
  assert.match(loading, /Chargement de My BookShelf/);
  assert.match(loading, /role="status"/);
  assert.match(styles, /\.primary-action:focus-visible/);
  assert.match(styles, /min-height: 2\.75rem/);
  assert.match(styles, /width: min\(100%, 44rem\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
