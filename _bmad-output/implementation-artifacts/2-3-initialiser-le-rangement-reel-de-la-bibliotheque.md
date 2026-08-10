---
story_id: "2.3"
story_key: "2-3-initialiser-le-rangement-reel-de-la-bibliotheque"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "0e9ca27"
---

# Story 2.3 : Initialiser le rangement réel de la bibliothèque

Status: review

## Story

En tant que Zan,
je veux ouvrir une bibliothèque fondée sur son rangement réel,
afin que le premier ajout et tous les suivants utilisent immédiatement la structure persistante définitive.

## Acceptance Criteria

1. **Modèle canonique.** Étant donné une première ouverture authentifiée, quand le statut de bibliothèque est résolu, alors les tables et ports `Copy`, `UserWork`, `Module`, `Shelf` et `Placement` sont disponibles avec ownership, versions et ordres stables, sans insérer de Copy, UserWork ou Placement.
2. **Initialisation idempotente.** Étant donné un utilisateur authentifié, quand la fondation est demandée plusieurs fois ou en concurrence, alors exactement un module initial et ses étagères sont présents pour chacun des statuts `À lire`, `En cours` et `Terminés`.
3. **Projection vide.** Étant donné une collection vide, quand la bibliothèque est ouverte, alors les trois statuts affichent un module et ses étagères réels, une explication et des actions distinctes vers Catalogue et ajout manuel, sans faux livre ni table miroir.
4. **Append atomique.** Étant donné une destination valide et un objet possédé, quand `appendPlacement` est exécuté, alors ownership, capacité, version et position sont validés dans une transaction ; un module suivant est créé exactement une fois si nécessaire.
5. **Rejeu et échec.** Étant donné le même `commandId`, une réponse inconnue ou un échec, quand l’opération est rejouée, alors le même reçu est retourné sans doublon, ou aucun module, étagère ou placement partiel ne subsiste.
6. **Sécurité et reprise.** Étant donné deux utilisateurs, quand l’un ouvre ou modifie son rangement, alors RLS et ownership empêchent toute lecture ou écriture croisée ; `LibraryViewState` continue de cibler uniquement les identifiants réels.

## Tasks / Subtasks

- [x] T1 — Livrer le modèle SQL canonique et RLS.
- [x] T2 — Livrer les invariants domaine/application et le port repository.
- [x] T3 — Implémenter l’initialisation idempotente et `appendPlacement` transactionnel.
- [x] T4 — Projeter la bibliothèque vide réelle dans l’interface privée.
- [x] T5 — Ajouter canari SQL, tests unitaires/intégration et preuves d’ownership/idempotence.
- [x] T6 — Exécuter les gates BMAD/CI et finaliser le journal.

## Definition of Done

- Aucun faux Copy, UserWork ou Placement n’est créé par l’initialisation.
- Aucun module intermédiaire n’est renuméroté ; les positions restent stables.
- Aucun accès direct au schéma canonique ne contourne `authenticatedTransaction`.
- Les gates lint, types, tests, database, E2E et `ci:all` sont verts.

## Dev Agent Record

### Summary

- Ajout du modèle canonique `UserWork`, `Copy`, `Module`, `Shelf`, `Placement` et des reçus de rejeu dans le schéma `library`.
- Ajout de l’initialisation idempotente des trois statuts avec cinq étagères par module, puis de l’append transactionnel avec capacité, ownership et rejeu par `commandId`.
- Projection de la fondation réelle vide dans `/bibliotheque`, avec états distincts par statut et actions vers Catalogue et ajout manuel.
- Ajout des preuves SQL/RLS, du canari d’intégration et des tests unitaires domaine.
- Revue adversariale traitée : verrou advisory contre la concurrence, validation de capacité, trigger de cohérence, reçu de rejeu protégé par fonction `security definer`, et état vide conditionnel à l’occupation.

### Validation

- `npm run ci:all` : vert, 747,5 s.
- Gates incluses : lint, typecheck, tests unitaires, intégration, fuite, environnement, migrations/RLS, reprise, E2E, budgets, statique et mutations.
- Revalidation ciblée post-revue : lint, typecheck, 194 tests unitaires et `npm run ci:database` verts, incluant les append concurrents.
- Une relance post-revue de `npm run ci:all` a dépassé le timeout outil de 15 minutes sans code d’échec exploitable ; les gates ciblées restent la preuve de validation disponible pour ce correctif.

### File List

- `supabase/migrations/20260807000100_library_foundation_expand.sql`
- `supabase/tests/database/library-foundation-rls.test.sql`
- `src/modules/library/domain/library-foundation.ts`
- `src/modules/library/application/library-foundation.ts`
- `src/modules/library/adapters/postgres-library-foundation.ts`
- `src/app/bibliotheque/page.tsx`
- `src/app/globals.css`
- `scripts/run-database-gates.mjs`
- `tests/unit/library-foundation.test.mjs`
- `tests/integration/database-library-foundation-canary.mjs`
- `tests/unit/library-view-state.test.mjs`

### Change Log

- 2026-08-07 : implémentation 2.3 terminée et prête pour revue.
- 2026-08-07 : corrections issues de la revue adversariale et preuve de concurrence ajoutées.
