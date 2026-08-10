---
story_id: "4.1"
story_key: "4-1-deplacer-un-exemplaire-par-geste-ou-commande-visible"
epic: 4
status: in-progress
created: "2026-08-10"
---

# Story 4.1 : Déplacer un exemplaire par geste ou commande visible

Status: in-progress

## Story

En tant que Zan, je veux déplacer un exemplaire vers une position choisie,
afin de ranger selon ma logique avec toute modalité d’interaction.

## Critères d’acceptation

1. Le glisser-déposer et la commande « Déplacer » utilisent la même commande avec statut, module, étagère et position explicites.
2. Une destination valide prévisualise le reflow local sans changer l’ordre relatif des autres livres avant confirmation.
3. Une destination invalide explique le refus et conserve strictement l’état confirmé précédent.
4. Le clavier seul permet de choisir la destination et les commandes Monter, Descendre, Avant et Après, puis rend le focus à la destination.

## Tâches

- [x] Définir le contrat de déplacement et la vérification de version.
- [x] Ajouter le repository SQL transactionnel avec idempotence et ownership.
- [x] Implémenter la commande visible et la confirmation accessible.
- [ ] Ajouter les chemins souris, tactile et clavier vers le même cas d’usage.
- [x] Tester capacité, conflit de version, rejeu et absence de mutation optimiste.

## Avancement d'implémentation

- Le planificateur de domaine recompose les étagères source et destination à partir de frontières de largeur, sans mutation avant confirmation.
- Le repository verrouille l'acteur et les lignes concernées, contrôle `expectedVersion`, utilise une contrainte unique différable et enregistre un reçu idempotent.
- La commande « Déplacer » est visible sur chaque exemplaire de la bibliothèque. Le glisser-déposer et les raccourcis Monter/Descendre restent à compléter sur la même commande.

## Définition de terminé

- Aucun déplacement partiel ni état optimiste confirmé.
- Le reflow est local, déterministe et réversible avant confirmation.
- Les tests E2E couvrent souris, tactile, clavier, conflit et restauration du focus.
