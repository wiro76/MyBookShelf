---
story_id: "3.1"
story_key: "3-1-choisir-lapparence-initiale-du-meuble"
epic: 3
status: review
created: "2026-08-07"
baseline_commit: "0147d60"
---

# Story 3.1 : Choisir l’apparence initiale du meuble

Status: review

## Story

En tant que Zan, je veux choisir gratuitement une structure et une finition, afin que la bibliothèque me ressemble dès la première utilisation.

## Critères d’acceptation

1. À la première connexion, plusieurs structures et finitions gratuites sont prévisualisables sans option présumée ni capacité payante.
2. Retour, annulation et confirmation conservent un état et un focus cohérents sur ordinateur, tablette et clavier.
3. Une confirmation persistée ne modifie aucun `Placement`, exemplaire ou statut de lecture.
4. Un échec conserve l’apparence précédente et rend l’intention réessayable.

## Contraintes techniques

- Réutiliser la transaction authentifiée et les garanties RLS de l’Epic 1.
- Persister uniquement une préférence d’apparence appartenant à l’utilisateur.
- Ne créer aucune projection parallèle du rangement.
- Tester le premier accès, l’annulation, le rejeu et l’échec sans mutation de bibliothèque.

## Tâches

- [x] Définir le contrat domaine des structures, finitions et préférence par défaut.
- [x] Ajouter la persistance privée idempotente et ses policies RLS.
- [x] Construire la prévisualisation et le formulaire accessible.
- [x] Ajouter les tests unitaires et database de non-régression du rangement.
- [x] Mettre à jour la page d’état du projet et la roadmap visuelle.

## Dev Agent Record

### Implementation Plan

- Modèle borné de structures et finitions gratuites dans le domaine `library`.
- Préférence privée `appearance_preferences`, isolée par RLS et indépendante des placements.
- Configurateur serveur/client intégré à la bibliothèque avec aperçu, annulation et confirmation.

### Validation

- `npm run typecheck` : vert.
- `npm run lint` : vert.
- Tests unitaires Story 3.1 : 2 verts.
- `npm run ci:database` : vert, y compris le canari RLS de l’apparence.
- E2E complet : à exécuter dès que le serveur Next de développement déjà ouvert sur `3003` sera libéré ; le harnais Playwright exige sa propre instance.

### File List

- `src/modules/library/domain/library-appearance.ts`
- `src/modules/library/application/library-appearance.ts`
- `src/modules/library/adapters/postgres-library-appearance.ts`
- `src/app/bibliotheque/appearance-actions.ts`
- `src/app/bibliotheque/appearance-onboarding.tsx`
- `supabase/migrations/20260807000800_library_appearance.sql`
- `supabase/tests/database/library-appearance-rls.test.sql`
- `tests/unit/library-appearance.test.mjs`
- `scripts/run-database-gates.mjs`
