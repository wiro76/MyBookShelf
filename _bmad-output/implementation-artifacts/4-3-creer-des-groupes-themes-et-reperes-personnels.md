---
story_id: "4.3"
story_key: "4-3-creer-des-groupes-themes-et-reperes-personnels"
epic: 4
status: in-progress
created: "2026-08-10"
---

# Story 4.3 : Créer des groupes, thèmes et repères personnels

Status: in-progress

## Story

En tant que Zan, je veux regrouper et marquer mes exemplaires selon plusieurs axes,
afin de représenter ma propre organisation.

## Traçabilité

CAP-6, CAP-11, CAP-12 ; FR-15 à FR-19, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6 ; AD-5 à AD-7, AD-11.

## Critères d’acceptation

1. Une sélection confirmée crée un groupe durable avec nom, ordre, total et répartition par statut, sans posséder les slots de rangement.
2. Un exemplaire peut appartenir à plusieurs thèmes ; ces associations many-to-many ne modifient aucun placement.
3. Un repère coloré est toujours accompagné d’un libellé, motif ou icône équivalent sans dépendre de la couleur.
4. Une suggestion de série ou thème est opt-in, explicable, réversible et sans effet avant confirmation.
5. Le retrait d’un exemplaire détache ses liens et supprime atomiquement tout groupe devenu vide.

## Tâches

- [ ] Définir le contrat de groupe, thème, repère et suggestion opt-in.
- [ ] Ajouter les tables, contraintes, RLS et reçus idempotents sans coupler les placements.
- [ ] Implémenter les commandes atomiques de création, association, modification et retrait.
- [ ] Ajouter l’interface de sélection, d’affichage accessible et de confirmation réversible.
- [ ] Tester isolation, concurrence, suppression des groupes vides et absence de réordonnancement.

## Definition of Done

- Les opérations de groupe et de thème sont atomiques, idempotentes et isolées par utilisateur.
- Aucun groupe ne possède ni ne réécrit les positions d’étagère.
- Les repères restent compréhensibles sans couleur et les suggestions ne mutent rien sans confirmation.
- Les gates typecheck, lint, unit, database et browser sont vertes.
