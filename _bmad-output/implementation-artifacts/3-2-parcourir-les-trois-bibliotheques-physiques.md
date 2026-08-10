---
story_id: "3.2"
story_key: "3-2-parcourir-les-trois-bibliotheques-physiques"
epic: 3
status: review
created: "2026-08-07"
baseline_commit: "85c5f32"
---

# Story 3.2 : Parcourir les trois bibliothèques physiques

Status: review

## Story

En tant que Zan, je veux parcourir Envie de lire, Terminés et En cours, afin de contempler mes exemplaires selon leur état de lecture.

## Critères d’acceptation

1. Le DOM suit statut > module > étagère > exemplaire et les exemplaires sont rendus par position réelle.
2. Une collection vide expose un module, une explication et des actions distinctes Catalogue/ajout manuel sans faux livre.
3. La projection utilise exclusivement Module/Shelf/Copy/Placement et reste lisible sur ordinateur et tablette.
4. La reprise exacte ou ajustée cible l’élément réellement rendu et annonce tout ajustement sans identifiant privé.

## Tâches

- [x] Étendre la projection PostgreSQL avec les exemplaires et leurs métadonnées bibliographiques.
- [x] Rendre les trois statuts avec une hiérarchie sémantique et les tranches positionnées.
- [x] Afficher une seule bibliothèque active avec un sélecteur de statut et conserver les trois parcours dans les données.
- [x] Donner aux livres une composition visuelle de tranche/couverture jointive et une zone de dépôt stable.
- [x] Préserver les états vides et les actions Catalogue/ajout manuel.
- [x] Ajouter les scénarios E2E de rendu, reprise, focus et annonce sur les quatre projets Playwright.
- [x] Passer la story en review après revue de code et validation E2E.

## Validation

- Tests unitaires et canaris fondation à maintenir verts.
- E2E bloquants : 36 scénarios validés sur les quatre projets Playwright après la convergence visuelle ; le statut reste review jusqu’à validation manuelle du rendu MVP.

## Convergence visuelle MVP

La vue ne rend plus trois bibliothèques côte à côte. Elle affiche une seule bibliothèque à la fois, choisie par les onglets Envie de lire, En cours et Terminés. Le statut de reprise est sélectionné automatiquement ; à défaut, le premier statut alimenté est ouvert. Les étagères restent navigables au clavier, les livres restent déplaçables par commande ou geste et la composition de chaque exemplaire rapproche couverture, tranche et titre dans un meuble unique.
