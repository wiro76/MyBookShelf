import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("la reprise reste une lecture et le focus client cible le résultat résolu", () => {
  const domain = read("src/modules/library/domain/library-view-state.ts");
  const focus = read("src/modules/library/ui/library-resume-focus.tsx");
  const page = read("src/app/bibliotheque/page.tsx");

  assert.doesNotMatch(domain, /\b(insert|update|delete)\b/i);
  assert.match(focus, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(focus, /scrollIntoView/);
  assert.match(focus, /role="status"/);
  assert.match(page, /getVerifiedSession\(\)/);
  assert.match(page, /resumeLibraryContext\(session\.user\.id/);
  assert.doesNotMatch(page, /searchParams|moduleId|shelfId|copyId/);
});

test("la migration force RLS sur le contexte et les reçus", () => {
  const migration = read("supabase/migrations/20260806000200_library_view_state_expand.sql");
  assert.match(migration, /alter table library\.library_view_states force row level security/i);
  assert.match(migration, /alter table library\.library_view_state_receipts force row level security/i);
  assert.match(migration, /to authenticated[\s\S]*\(select auth\.uid\(\)\) = user_id/i);
  assert.doesNotMatch(migration, /grant[^;]+\bto anon\b/i);
});
