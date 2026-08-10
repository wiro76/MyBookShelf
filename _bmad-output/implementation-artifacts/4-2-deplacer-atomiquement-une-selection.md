---
story_id: "4.2"
story_key: "4-2-deplacer-atomiquement-une-selection"
epic: 4
status: done
created: "2026-08-10"
---

# Story 4.2 : Déplacer atomiquement une sélection

Status: done

## Story

En tant que Zan, je veux sélectionner et déplacer plusieurs exemplaires,
afin de ranger une série sans mouvement partiel.

## Critères d’acceptation

1. Le clic, le toucher et la barre Espace rendent visibles le compte et l’état de chaque membre sélectionné.
2. Une destination suffisante reverifie toutes les cibles, les verrouille dans l’ordre des identifiants et les déplace dans une transaction unique.
3. Une version divergente, une cible indisponible ou une capacité insuffisante annule toute l’opération et explique le conflit.
4. Une action Annuler utilise une commande inverse vérifiant les versions et ne détruit jamais une modification concurrente.

## Tâches

- [x] Définir le contrat de sélection et de déplacement groupé.
- [x] Implémenter la planification multi-source sans mutation optimiste.
- [x] Ajouter le repository transactionnel, les verrous déterministes et l’idempotence.
- [x] Ajouter la sélection souris, tactile et clavier avec retour accessible.
- [x] Tester succès, conflit, capacité, rejeu et annulation.

## Dev Agent Record

### File List

- `src/modules/library/domain/library-move.ts`
- `src/modules/library/application/library-move.ts`
- `src/modules/library/adapters/postgres-library-move.ts`
- `src/app/bibliotheque/move-actions.ts`
- `src/modules/library/ui/library-selection-move-form.tsx`
- `src/modules/library/ui/library-projection.tsx`
- `src/app/globals.css`
- `supabase/migrations/20260810000400_library_selection_move_receipts.sql`
- `supabase/migrations/20260810000500_library_selection_move_undo.sql`
- `tests/unit/library-move.test.mjs`
- `tests/e2e/bibliotheque-projection.spec.ts`

### Completion Notes

- La sélection est native, accessible par clic, toucher et Espace, avec compte visible.
- La planification retire toutes les cibles, les ordonne canoniquement et les insère comme bloc.
- Le repository verrouille les placements et étagères dans un ordre déterministe et confirme ou annule toute la transaction.
- L’annulation conserve les affectations précédentes et refuse la restauration si une version a divergé.

### Validation

- `npm run typecheck`
- `npm run lint` (un avertissement préexistant sur `<img>`, aucune erreur)
- `npm run ci:unit` : 214 tests passants
- `npm run ci:database` : migrations et canaris base passants
- E2E complet : 196 scénarios passants
- E2E Story 4.2 : déplacement et annulation validés sur quatre profils d’affichage

### Change Log

- 2026-08-10 : contrat, transaction groupée, sélection accessible et reçu idempotent ajoutés.
- 2026-08-10 : annulation contrôlée par versions ajoutée avec conservation de l’état précédent.
- 2026-08-10 : canari base ajouté pour prouver le succès atomique et le refus d’une annulation concurrente.
