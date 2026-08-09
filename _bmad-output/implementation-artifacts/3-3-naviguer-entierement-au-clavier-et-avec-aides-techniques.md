---
story_id: "3.3"
story_key: "3-3-naviguer-entierement-au-clavier-et-avec-aides-techniques"
epic: 3
status: in-progress
created: "2026-08-10"
baseline_commit: "2b1689c"
---

# Story 3.3 : Naviguer entièrement au clavier et avec aides techniques

Status: in-progress

## Story

En tant que Zan, je veux parcourir la bibliothèque sans geste obligatoire, afin d’obtenir la même expérience quelle que soit mon interaction.

## Critères d’acceptation

1. Les flèches parcourent les exemplaires d’une étagère, Haut/Bas changent d’étagère et Home/End atteignent les extrémités.
2. Page précédente/suivante change de module sans perdre la cible.
3. Une tranche expose titre, auteur, édition, statut et position ; les visuels décoratifs restent masqués.
4. Le focus reste visible et les quatre profils Playwright conservent une expérience équivalente.

## Tâches

- [ ] Ajouter la navigation clavier spatiale sur la projection réelle.
- [ ] Exposer les informations de tranche via le nom accessible.
- [ ] Vérifier focus, reflow et axe sur les quatre profils.
- [ ] Passer la story en review après validation E2E.
