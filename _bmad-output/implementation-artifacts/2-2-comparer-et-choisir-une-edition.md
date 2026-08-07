---
story_id: "2.2"
story_key: "2-2-comparer-et-choisir-une-edition"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "6e1b687"
---

# Story 2.2 : Comparer et choisir une édition

Status: review

## Story

En tant que Zan,
je veux comparer les éditions d’une œuvre,
afin de choisir celle que je possède réellement avant tout ajout.

## Acceptance Criteria

1. **Comparaison.** Étant donné une œuvre avec plusieurs éditions, quand la fiche s’affiche, alors chaque édition présente dans une surface comparable sa couverture disponible ou son absence explicite, son ISBN, sa pagination, sa date et sa provenance.
2. **Sélection accessible.** Étant donné une édition candidate, quand Zan la choisit au pointeur, au toucher ou au clavier, alors radio, texte, contour et région live indiquent la même sélection sans dépendre de la couleur.
3. **Référence stable.** Étant donné la même œuvre et édition normalisées, quand la sélection est rendue, alors elle porte une référence opaque déterministe, stable malgré le rendu et dépourvue d’identifiant fournisseur, de claim ou d’URL brute.
4. **Non-mutation.** Étant donné une sélection, quand elle est activée ou modifiée, alors aucune Work, Edition, Copy, UserWork, Placement, média, requête SQL ou commande d’ajout n’est créée ; l’interface annonce seulement la prochaine confirmation.
5. **Rapprochement explicite.** Étant donné deux éditions proches sans preuve exacte, quand elles sont affichées, alors elles restent séparées et aucun rapprochement silencieux ou irréversible n’est proposé.
6. **Résilience et accessibilité.** Étant donné une édition incomplète, un candidat vide ou une session indisponible, quand la fiche est rendue, alors les valeurs absentes sont explicites, aucune donnée interne ne fuit au client et la surface reste utilisable au clavier, tactile, zoom 200 %, reflow 320 px et espacement WCAG.

## Tasks / Subtasks

- [x] T1 — Définir la référence de sélection opaque et ses invariants.
  - [x] Produire une référence déterministe à partir du candidat et de l’édition sans exposer de sourceId.
  - [x] Tester déterminisme, séparation de deux éditions et absence de claims/URLs dans la présentation.
- [x] T2 — Étendre le DTO d’affichage sans franchir la frontière catalogue.
  - [x] Ajouter référence de sélection, provenance bornée et états de couverture explicites.
  - [x] Préserver l’exclusion des claims, empreintes, identifiants fournisseur et toute donnée brute.
- [x] T3 — Construire le sélecteur accessible.
  - [x] Afficher les éditions en comparaison stable avec radio, métadonnées, contour et annonce live.
  - [x] Conserver une sélection locale uniquement et annoncer la future confirmation sans bouton de mutation.
- [x] T4 — Prouver l’absence de mutation et les cas limites.
  - [x] Ajouter tests unitaires, frontière architecturale et E2E sur pointeur, tactile et clavier.
  - [x] Couvrir édition sans ISBN, sans pagination, sans couverture, candidat mono-édition et rapprochement non exact.
- [x] T5 — Clôturer BMAD.
  - [x] Exécuter lint, types, tests ciblés et CI complète.
  - [x] Compléter le journal, la liste des fichiers et passer story/sprint à review.

## Definition of Done

- Aucun effet persistant avant Story 2.4.
- Toutes les références envoyées au navigateur sont opaques, bornées et non sensibles.
- Les quatre profils Playwright couvrent sélection souris, tactile et clavier.
- Les tests ciblés et `npm run ci:all` sont verts.

## Dev Agent Record

### Implementation Summary

- Référence opaque `edition-<sha256 tronqué>` déterministe, dérivée du candidat et de l’édition, sans sourceId ni claim au navigateur.
- DTO enrichi avec provenance fournisseur bornée et état de couverture explicite `not-provided` ; aucune donnée brute ou autorité canonique ne traverse la frontière.
- Sélecteur radio comparable avec ISBN, pagination, date, provenance, couverture, contour, focus et région live ; sélection locale uniquement.
- Aucun bouton de mutation ni appel de commande : la confirmation d’ajout reste explicitement future.

### Validation

- `npm run typecheck` — vert.
- `npm run lint` — vert.
- Tests unitaires/intégration ciblés — verts, incluant stabilité de référence et DTO non sensible.
- `npx playwright test tests/e2e/catalogue.spec.ts --workers=1` — 28/28 verts sur les quatre profils.
- `npm run ci:all` — vert en 721,5 s.

### File List

- `_bmad-output/implementation-artifacts/2-2-comparer-et-choisir-une-edition.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/modules/catalog/application/edition-selection.ts`
- `src/app/catalogue/state.ts`
- `src/app/catalogue/actions.ts`
- `src/app/catalogue/catalogue-search.tsx`
- `src/app/globals.css`
- `tests/unit/catalog-search.test.mjs`
- `tests/integration/catalog-session-boundary.test.mjs`
- `tests/e2e/catalogue.spec.ts`

## Change Log

| Date | Changement |
|---|---|
| 2026-08-07 | Story 2.2 préparée après validation de l’ordre Epic 2 et du contrat non mutant. |
| 2026-08-07 | Comparaison et sélection opaque d’édition implémentées, testées et passées en revue ; statut `review`. |
