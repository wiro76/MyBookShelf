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
- [x] Préserver les états vides et les actions Catalogue/ajout manuel.
- [x] Ajouter les scénarios E2E de rendu, reprise, focus et annonce sur les quatre projets Playwright.
- [x] Passer la story en review après revue de code et validation E2E.

## Validation

- Tests unitaires et canaris fondation à maintenir verts.
- E2E bloquants : 12/12 verts sur les quatre projets Playwright.
