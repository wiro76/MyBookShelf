import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("chaque porte a une preuve négative exécutable et aucune échappatoire", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
  const mutations = JSON.parse(readFileSync("tests/fixtures/ci-gate-mutations.json", "utf8"));
  assert.deepEqual(mutations.map(({ gate }) => gate), ["lint", "types", "unit", "integration", "database", "browser", "budgets", "environment", "static"]);
  assert.ok(mutations.every(({ expectedExit }) => expectedExit !== 0));
  assert.doesNotMatch(workflow, /continue-on-error|\|\| true/);
  assert.doesNotMatch(workflow, /secrets\.[A-Z_]*PRODUCTION|environment:\s*production/);
});
