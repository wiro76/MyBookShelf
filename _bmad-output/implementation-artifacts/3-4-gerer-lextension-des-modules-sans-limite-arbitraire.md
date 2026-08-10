---
story_id: "3.4"
story_key: "3-4-gerer-lextension-des-modules-sans-limite-arbitraire"
epic: 3
status: review
created: "2026-08-10"
baseline_commit: "2443ef4"
---

# Story 3.4 : Gérer l’extension des modules sans limite arbitraire

Status: review

## Story

En tant que Zan, je veux que ma bibliothèque s’agrandisse, afin d’organiser au moins 100 exemplaires sans perdre mes repères.

## Critères d’acceptation

1. Un append sur un module plein crée exactement le module suivant dans la même transaction.
2. Les modules intermédiaires vides persistent et les modules sont rendus dans l’ordre canonique.
3. La projection ne fixe aucune limite artificielle de modules ou d’exemplaires.
4. Les tests de concurrence et de RLS prouvent l’absence de placement partiel.

## Tâches

- [x] Réutiliser l’append atomique et le verrou de fondation de Story 2.3.
- [x] Rendre tous les modules projetés avec une hiérarchie et un nom accessibles.
- [x] Maintenir la preuve de concurrence et de création d’un seul module suivant.
- [x] Ajouter le scénario de charge à 100 exemplaires et sa mesure de budget.
- [x] Passer la story en review après la preuve de charge.

## Validation

- Typecheck et lint : verts.
- E2E : 8/8 verts sur quatre profils, 100 exemplaires et cinq modules.
