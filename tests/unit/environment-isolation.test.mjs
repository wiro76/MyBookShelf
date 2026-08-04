import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("les quatre cibles possèdent des fingerprints publics distincts", () => {
  const targets = JSON.parse(readFileSync("config/environments.json", "utf8"));
  assert.deepEqual(Object.keys(targets), ["local", "preview", "staging", "production"]);
  assert.equal(new Set(Object.values(targets)).size, 4);
  for (const value of Object.values(targets)) assert.match(value, /^[a-z0-9-]+$/);
});

test("le garde refuse une cible partagée ou une référence production hors production", () => {
  const invalid = spawnSync(process.execPath, ["scripts/verify-environment-isolation.mjs"], {
    env: { ...process.env, APP_ENV: "preview", TARGET_FINGERPRINT: "production-mbs-v1", SUPABASE_URL: "https://production.example.invalid", SUPABASE_ANON_KEY: "preview-only" },
    encoding: "utf8",
  });
  assert.notEqual(invalid.status, 0);
});

test("le garde accepte une preview explicitement isolée", () => {
  const valid = spawnSync(process.execPath, ["scripts/verify-environment-isolation.mjs"], {
    env: { ...process.env, APP_ENV: "preview", TARGET_FINGERPRINT: "preview-mbs-v1", SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "preview-only" },
    encoding: "utf8",
  });
  assert.equal(valid.status, 0, valid.stderr);
});
