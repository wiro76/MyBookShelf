import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const text = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(text(path));

test("la CI de pull request est bloquante, minimale et reproductible", () => {
  const workflow = text(".github/workflows/ci.yml");
  const pkg = json("package.json");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /node-version: 24\.18\.0/);
  assert.match(workflow, /npm ci/);
  assert.doesNotMatch(workflow, /continue-on-error|\|\| true|environment:\s*production/);
  for (const script of ["ci:static", "ci:lint", "ci:types", "ci:unit", "ci:integration", "ci:database", "ci:recovery", "ci:e2e", "ci:budgets", "ci:all"]) {
    assert.equal(typeof pkg.scripts[script], "string", `script absent: ${script}`);
  }
  assert.equal(pkg.scripts["ci:recovery"], "node scripts/run-recovery-gates.mjs");
  assert.match(pkg.scripts.build, /typecheck/);
  assert.match(workflow, /npm run ci:mutations/);
  assert.match(workflow, /\n  recovery:\n[\s\S]*?npm run ci:recovery\n\n  browser:/);
  for (const gate of ["ci:environment", "ci:database", "ci:recovery", "ci:e2e", "ci:budgets", "ci:static", "ci:mutations"]) {
    assert.match(pkg.scripts["ci:all"], new RegExp(gate.replace(":", "\\:")), `porte absente de ci:all: ${gate}`);
  }
});

test("les rapports utiles ne sont conservés que sur échec", () => {
  const workflow = text(".github/workflows/ci.yml");
  assert.match(workflow, /if: failure\(\)/);
  assert.match(workflow, /playwright-report/);
  assert.match(workflow, /test-results/);
});
