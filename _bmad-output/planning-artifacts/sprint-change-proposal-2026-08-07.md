# Sprint Change Proposal — Epic 2

**Date :** 2026-08-07  
**Projet :** My BookShelf  
**Portée :** Moderate — réorganisation du backlog avec coordination Product Owner / Developer  
**Statut :** Approuvé par Zan-missel le 2026-08-07

## 1. Résumé du problème

La rétrospective de l’Epic 1 a révélé que Story 2.3 exigeait `Copy`, `UserWork`, `Module`, `Shelf` et `Placement` atomiques et immédiatement manipulables, alors que la projection réelle n’était attribuée qu’aux Stories 3.2 et 3.4. Story 1.7 interdit explicitement toute table ou projection temporaire. En parallèle, Story 2.1 ne précisait pas suffisamment que les réponses fournisseurs restent des candidats non autoritatifs conformément à AD-7.

Le MVP et ses exigences restent valides. Le défaut porte sur l’allocation et l’ordre des stories.

## 2. Analyse d’impact

- **Epic 2 :** ajout d’une Story 2.3 de fondation réelle ; anciennes 2.3 à 2.7 renumérotées 2.4 à 2.8 ; 2.1/2.2 rendues explicitement non mutantes.
- **Epic 3 :** 3.2 consomme la projection canonique livrée par 2.3 ; 3.4 durcit et prouve l’extension à l’échelle.
- **Epics 4 à 6 :** découpage inchangé ; réutilisation du même domaine de placement et de `appendPlacement`.
- **PRD :** aucun changement ; FR-5/FR-6 et UJ-2/UJ-3 restent autoritatifs.
- **Architecture :** aucun changement de décision ; AD-5 et AD-7 justifient la correction.
- **UX :** précision technique sur la fiche de candidat non persisté avant ajout explicite.
- **Code/infrastructure :** aucun rollback et aucune modification immédiate d’infrastructure ; le travail de domaine est déplacé dans une story explicite.

## 3. Approche recommandée

**Option retenue : ajustement direct.** Effort moyen, risque moyen, impact de calendrier limité à l’explicitation d’une story supplémentaire. Aucun travail terminé n’est annulé et aucune capacité MVP n’est réduite.

Ordre conservé : `1 → 2 → 3 → 4 → 5 → 6`.

Ordre Epic 2 : `2.1 recherche non mutante → 2.2 sélection non mutante → 2.3 rangement réel → 2.4 ajout catalogue → 2.5 import média → 2.6 ajout manuel → 2.7 gouvernance média → 2.8 GC média`.

## 4. Propositions détaillées

### Story 2.1

- **Avant :** la fiche complète de l’Œuvre s’ouvre depuis un résultat.
- **Après :** les adaptateurs produisent uniquement des `NormalizedCandidate` avec provenance ; la fiche affichée ne persiste aucune entité canonique.

### Story 2.2

- **Avant :** l’identifiant d’édition alimente la commande d’ajout.
- **Après :** une référence stable de candidat est sélectionnée sans effet persistant avant confirmation.

### Nouvelle Story 2.3

Initialiser idempotemment la projection réelle `Module > Shelf`, livrer les contrats canoniques de rangement et l’opération atomique `appendPlacement`, sans faux exemplaire ni structure transitoire.

### Stories 2.4 à 2.8

- L’ancienne 2.3 devient 2.4 et devient la première mutation : résolution/création canonique Work/Edition avec provenance, puis Copy, UserWork et Placement atomiques.
- Les anciennes 2.4 à 2.7 deviennent 2.5 à 2.8 ; leurs dépendances média sont renumérotées.

### Stories 3.2 et 3.4

- 3.2 consomme la projection canonique de 2.3 et l’étend aux trois bibliothèques et à la reprise visuelle.
- 3.4 conserve le cycle de vie des modules, le fenêtrage et la preuve à 100 exemplaires ; elle vérifie l’invariant `appendPlacement` déjà livré.

### Artefacts secondaires

Mettre à jour matrice FR, audit FR-28/FR-29, readiness, sprint status, renvois historiques futurs et roadmap visuelle. PRD, décisions d’architecture, CI, déploiement et observabilité restent inchangés.

## 5. Handoff d’implémentation

- **Product Owner / PM :** maintenir le découpage, la traçabilité et le sprint status.
- **Architecte :** contrôler AD-5/AD-7, ownership des modules et absence de projection temporaire.
- **Developer :** créer puis implémenter Story 2.1 ; poursuivre ensuite dans l’ordre approuvé.
- **Reviewer :** exécuter une revue adversariale distincte et vérifier les scénarios négatifs.

### Critères de succès

1. Les artefacts ne contiennent plus de dépendance future entre Epics 2 et 3.
2. Story 2.1 ne peut pas muter le canon local.
3. Aucun Copy ou Placement n’est créé avant la fondation réelle de Story 2.3.
4. Les 37 stories et leur statut sont représentés sans ambiguïté.
5. Chaque story passe les portes BMAD et CI avant `done`.
