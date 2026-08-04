import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("le harnais Supabase est local, éphémère et épinglé", () => {
  const config = read("supabase/config.toml");
  const runner = read("scripts/run-database-gates.mjs");
  assert.match(config, /major_version = 17/);
  assert.match(runner, /supabase@2\.101\.0/);
  assert.match(runner, /["']db["'],\s*["']reset/);
  assert.match(runner, /pgtap/);
  assert.match(runner, /docker["'], \["exec", "-i"/);
  assert.doesNotMatch(runner, /--project-ref|SUPABASE_ACCESS_TOKEN/);
});

test("les canaris prouvent RLS, migration, atomicité et idempotence sans domaine produit", () => {
  const rls = read("supabase/tests/database/rls.test.sql");
  const migration = read("supabase/tests/database/migration-compatibility.test.sql");
  const command = read("tests/integration/database-command-canary.mjs");
  assert.match(rls, /throws_ok/);
  assert.match(rls, /is_empty/);
  assert.match(migration, /old_client/);
  assert.match(migration, /new_client/);
  assert.match(command, /ROLLBACK/);
  assert.match(command, /command_id/);
  assert.doesNotMatch(`${rls}\n${migration}\n${command}`, /\b(Copy|UserWork|Reading)\b/);
});
