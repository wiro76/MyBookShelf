---
story_id: "2.4"
story_key: "2-4-ajouter-ledition-choisie-comme-envie-de-lire"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "4cd0808"
---

# Story 2.4 : Ajouter l’édition choisie comme envie de lire

Status: review

## Story

En tant que Zan,
je veux ajouter explicitement une édition comme envie de lire,
afin d’obtenir un premier exemplaire manipulable sans dépendre d’une future Lecture.

## Acceptance Criteria

1. Une confirmation d’édition crée ou résout Work et Edition avec leur provenance, puis exactement un Copy et un UserWork `want-to-read`, sans Reading.
2. L’opération réutilise le placement réel et crée Copy, UserWork et Placement atomiquement.
3. Les statuts `reading` et `finished` ne sont pas proposés par cette action.
4. Un même `commandId` rejoué retourne le même Copy sans doublon ; un échec ne laisse aucun objet partiel.

## Tasks / Subtasks

- [x] T1 — Ajouter le modèle canonique Work/Edition et les reçus d’ajout.
- [x] T2 — Ajouter le port d’application et l’adaptateur transactionnel avec placement réel.
- [x] T3 — Exposer une confirmation d’ajout depuis l’édition sélectionnée.
- [x] T4 — Ajouter les tests unitaires, SQL/RLS, rejeu et rollback.
- [x] T5 — Exécuter les gates et finaliser le journal BMAD.

## Definition of Done

- Aucun Reading n’est créé.
- Un rejeu ne crée ni second Copy ni second Placement.
- L’ownership, la capacité et la provenance restent bornés côté serveur.
- Les validations lint, types, unitaires et database sont vertes.

## Dev Agent Record

### Summary

- Ajout des tables canonique `Work`, `Edition` et `library_add_receipts` avec ownership et références vers Copy/Placement.
- Ajout du port et de l’adaptateur transactionnel qui résout Work/Edition, crée UserWork `want-to-read`, Copy, Placement et reçu dans une seule transaction.
- Ajout de l’action Catalogue « Ajouter comme envie de lire » avec sélection opaque, état en cours, confirmation, rejeu et échec.
- Aucun Reading n’est créé ; En cours et Terminés ne sont pas proposés par cette action.

### Validation

- `npm run lint` : vert.
- `npm run typecheck` : vert.
- Tests unitaires ciblés : 5/5 verts.
- `npm run ci:database` : vert, incluant RLS, rejeu, placement réel et absence de Reading.

### File List

- `supabase/migrations/20260807000300_library_want_to_read.sql`
- `supabase/tests/database/library-want-to-read-rls.test.sql`
- `src/modules/library/domain/library-want-to-read.ts`
- `src/modules/library/application/library-want-to-read.ts`
- `src/modules/library/adapters/postgres-library-want-to-read.ts`
- `src/app/catalogue/actions.ts`
- `src/app/catalogue/catalogue-search.tsx`
- `tests/unit/library-want-to-read.test.mjs`
- `tests/integration/database-library-foundation-canary.mjs`
- `scripts/run-database-gates.mjs`

### Change Log

- 2026-08-07 : implémentation de l’ajout d’une édition choisie comme envie de lire, prête pour revue.
