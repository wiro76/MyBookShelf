---
story_id: "3.5"
story_key: "3-5-afficher-des-visuels-de-couverture-et-de-tranche-independants"
epic: 3
status: in-progress
created: "2026-08-10"
baseline_commit: "00f247e"
---

# Story 3.5 : Afficher des visuels de couverture et de tranche indépendants

Status: in-progress

## Story

En tant que Zan, je veux voir la couverture et la tranche d’un exemplaire séparément, afin que la bibliothèque reste lisible et fidèle à mes livres.

## Critères d’acceptation

1. La couverture et la tranche sont deux surfaces indépendantes dans le DOM.
2. Une couverture absente n’empêche ni le rendu de la tranche, ni la navigation, ni la reprise.
3. Une image n’est rendue que lorsqu’une référence média gouvernée pourra être résolue ; aucun UUID ou chemin privé n’est exposé.
4. Les surfaces restent accessibles et sans chevauchement sur ordinateur et tablette.

## Tâches

- [x] Séparer la surface de couverture de la tranche dans le composant de projection.
- [x] Rendre explicitement l’état « couverture non fournie ».
- [ ] Brancher un résolveur média signé pour les couvertures disponibles.
- [ ] Ajouter les E2E visuels et le contrôle de reflow.
- [ ] Passer la story en review après validation média.
