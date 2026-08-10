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

- [x] Définir le contrat de groupe, thème, repère et suggestion opt-in.
- [x] Ajouter les tables, contraintes, RLS et reçus idempotents sans coupler les placements.
- [x] Implémenter les commandes atomiques de création et d’association ; planifier modification et retrait.
- [ ] Ajouter l’interface complète groupes + thèmes, l’affichage accessible et la confirmation réversible.
- [x] Tester validation, rejeu, RLS de base et absence de couplage aux placements.

## Definition of Done

- Les opérations de groupe et de thème sont atomiques, idempotentes et isolées par utilisateur.
- Aucun groupe ne possède ni ne réécrit les positions d’étagère.
- Les repères restent compréhensibles sans couleur et les suggestions ne mutent rien sans confirmation.
- Les gates typecheck, lint, unit, database et browser sont vertes.

## Avancement

- `src/modules/library/domain/library-groups.ts` définit les contrats et bornes de nom, UUID, cardinalité et repère visuel.
- `src/modules/library/application/library-groups.ts` expose les reçus et empreintes de commandes.
- `src/modules/library/adapters/postgres-library-groups.ts` persiste les groupes, thèmes et associations sous transaction authentifiée.
- `supabase/migrations/20260810000600_library_groups_themes.sql` ajoute les tables, contraintes et policies RLS sans modifier `library.placements`.
- `tests/integration/database-library-groups-canary.mjs` prouve création, rejeu, association et repère non chromatique.
- `tests/unit/library-groups.test.mjs` couvre les validations domaine.
- `src/app/bibliotheque/groups-actions.ts` expose la création authentifiée d’un groupe et d’un repère.
- `src/modules/library/ui/library-groups-form.tsx` permet la création visible d’un groupe ou repère et affiche les données persistantes.

### Incrément visuel livré

La création de groupe est disponible dans `/bibliotheque` lorsqu’au moins un exemplaire est placé. La sélection est bornée aux copies réellement projetées, le bouton reste désactivé sans sélection et le résultat est annoncé dans une région `status`. Les groupes persistants sont listés avec leur volume et les repères peuvent être créés avec un libellé, une icône, un motif et une couleur facultative. L’association d’un repère à des exemplaires et le retrait réversible restent à intégrer.
