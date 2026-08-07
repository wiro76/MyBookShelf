---
baseline_commit: f96900fb4e05712c485e8e88b8346ca454cfcd38
---

# Story 1.8 : Percevoir et reprendre chaque sauvegarde

Status: done

## Story

En tant que Zan,
je veux savoir si une action est enregistrée,
afin de pouvoir agir sans craindre une corruption silencieuse.

**Traçabilité :** CAP-12, CAP-11 ; FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 ; AD-3, AD-6, AD-11, AD-12.

Cette story livre le coordinateur client et la surface accessible que toutes les mutations du produit réutiliseront. Elle consomme les enveloppes et reçus transactionnels livrés par Story 1.7 ; elle ne recrée ni registre de reçus, ni accès PostgreSQL, ni fausse mutation de livre.

## Critères d'acceptation

1. **Étant donné** qu'une mutation est envoyée, **quand** l'intention quitte l'interface, **alors** « Sauvegarde… » est affiché et annoncé, puis « Enregistré » n'apparaît qu'après un reçu transactionnel idempotent corrélé à la commande active.
2. **Étant donné** une panne réseau ou une réponse inconnue, **quand** aucun reçu n'est disponible, **alors** aucune réussite n'est affichée, l'état confirmé est restauré, l'intention est conservée si possible et `Réessayer` renvoie exactement la même enveloppe, avec le même `commandId`.
3. **Étant donné** des versions locale et distante divergentes à la reconnexion, **quand** le serveur retourne un conflit, **alors** la dernière projection confirmée distante est restaurée, l'intention locale reste disponible et un choix explicite présente les deux états et leurs conséquences avant abandon ou nouvelle commande.
4. **Étant donné** une action au clavier, au toucher ou au pointeur, **quand** elle change un état, **alors** le feedback perceptible apparaît en moins de 100 ms et l'interface se stabilise en moins de 500 ms sur une charge représentative de 100 éléments.

## Décisions tranchées

| Sujet | Décision |
|---|---|
| Autorité | Le serveur et son reçu transactionnel restent seuls autoritatifs. IndexedDB ne contient que des intentions explicitement non confirmées. |
| Retry réseau | Rejouer l'enveloppe originale octet pour octet : même `commandId`, payload, versions attendues et `occurredAt`. Une coupure après commit peut masquer un reçu déjà écrit. |
| Conflit | Ne jamais modifier une enveloppe existante. Restaurer le distant ; « Conserver la version distante » abandonne l'intention, « Appliquer ma modification » crée une nouvelle enveloppe avec un nouveau `commandId` et les versions rechargées. |
| Reçu | Un succès UI exige un reçu corrélé au `commandId` et au `commandType` actifs. Étendre le reçu 1.7 avec ces champs sans modifier son hash ni sa sémantique transactionnelle. Une réponse tardive ne peut confirmer une commande plus récente. |
| Optimisme | Le coordinateur sépare toujours `confirmed` et `optimistic`. Échec et conflit restaurent `confirmed` sans reconstruction approximative. |
| Persistance | Adaptateur IndexedDB natif derrière un port, avec schéma versionné, TTL, validation stricte, isolation par acteur et purge explicite. Aucun token, cookie ou message fournisseur n'est stocké. |
| Concurrence | Une commande active par clé d'agrégat, FIFO par défaut. Aucune coalescence implicite. Priorité globale : conflit, erreur, sauvegarde, enregistré, repos. |
| UI | Texte obligatoire, icône seulement en renfort. Région live polie sans cascade ; erreur persistante avec bouton `Réessayer` ; conflit sous forme de dialogue accessible avec restitution du focus. |
| Preuve E2E | Une route de fixture dédiée peut exercer le composant générique sur les quatre projets Playwright. Elle doit retourner 404 sans `ENABLE_E2E_HARNESS=1` et ne contenir aucune donnée produit ou privée. |
| Intégration future | Chaque story qui introduit une mutation métier doit brancher ce coordinateur et ajouter ses propres E2E. Story 1.8 ne fabrique pas de `Module`, `Shelf`, `Copy`, `Placement`, Reading, achat ou crédit. |

## Contrats imposés

### Machine d'état

```text
idle -> pending -> saved
                -> failed -> pending (même commande)
                -> conflict -> idle (distant) | pending (nouvelle commande locale)
```

- `pending` conserve l'enveloppe immuable, l'état confirmé et l'état optimiste.
- `saved` exige un reçu valide et corrélé ; Realtime n'est jamais un reçu.
- `failed` restaure l'état confirmé et conserve l'intention réessayable.
- `conflict` expose des résumés métier local/distant et des conséquences, jamais JSON, UUID ou numéros de version techniques.
- Toute transition terminale ou réponse est ignorée si son `commandId` ne correspond pas à l'opération active.

### Stockage d'intention

Une entrée persistée porte `schemaVersion: 1`, l'acteur, l'enveloppe complète, `storedAt` et `expiresAt`. La clé ne permet aucune lecture inter-acteur. Une entrée expirée, corrompue ou de version inconnue est supprimée et ne peut pas être rejouée. L'entrée disparaît seulement après reçu corrélé, abandon explicite ou expiration. Les commandes d'achat et de crédit restent exclues du rejeu hors ligne.

### Messages stables

| État | Texte visible et annoncé |
|---|---|
| Envoi | `Sauvegarde…` |
| Reçu | `Enregistré` |
| Résultat inconnu | `La sauvegarde n'a pas pu être confirmée.` + `Réessayer` |
| Conflit | `Cette modification diffère de la version enregistrée.` puis choix local/distant explicite |

## Tâches / Sous-tâches

- [x] **T1 — Domaine de sauvegarde générique (AC: 1 à 4)**
  - [x] Créer sous `src/shared/mutations/` les enveloppes/reçus génériques, erreurs stables, snapshots et reducer pur discriminé
  - [x] Corréler chaque réponse, interdire `saved` sans reçu et restaurer `confirmed` sur échec/conflit
  - [x] Agréger plusieurs opérations avec la priorité imposée et garder un coût borné pour 100 opérations

- [x] **T2 — Coordinateur et reprise d'intention (AC: 1 à 3)**
  - [x] Créer un coordinateur testable par ports `MutationTransport`, `PendingIntentStore`, horloge et fabrique de commande
  - [x] Persister avant l'envoi, supprimer seulement après reçu/abandon et rejouer inchangée une réponse inconnue
  - [x] Sur conflit, recharger/restaurer le distant ; conserver le local ; créer une nouvelle enveloppe seulement après choix local explicite
  - [x] Sérialiser par clé d'agrégat et ignorer les réponses tardives/hors ordre

- [x] **T3 — IndexedDB isolé et défensif (AC: 2, 3)**
  - [x] Implémenter l'adaptateur navigateur natif sans nouvelle dépendance et un adaptateur mémoire pour tests
  - [x] Valider schéma, UUID, dates, TTL, acteur et enveloppe à chaque lecture ; purger données invalides/expirées et permettre la purge à la déconnexion
  - [x] Prouver persistance après réouverture, isolation de compte et absence de secret/donnée dans URL ou HTML serveur

- [x] **T4 — Feedback et arbitrage accessibles (AC: 1 à 4)**
  - [x] Créer le composant/hook client réutilisable `MutationFeedback` : repos, sauvegarde, reçu, erreur et conflit
  - [x] Utiliser une région live polie sans cascade ; dialogue natif ou composant accessible, focus initial logique, fermeture et restitution du focus
  - [x] Fournir commandes texte explicites, cibles 44/48 px, focus 3:1, zoom/reflow et aucune information par couleur seule
  - [x] Ajouter une fixture locale non déployable pour exercer succès, réponse inconnue, retry et conflit sans inventer de donnée métier

- [x] **T5 — Consommer le reçu 1.7 (AC: 1 à 3)**
  - [x] Rendre `LibraryViewStateReceipt` autocorrélable (`commandId`, `commandType`) dans application, adaptateur PostgreSQL et canari réel
  - [x] Préserver le registre, le hash canonique, l'idempotence, RLS et les erreurs stables existantes
  - [x] Prouver commit avec réponse perdue puis `replayed`, même commande concurrente, conflit de version et réutilisation hostile

- [x] **T6 — Preuves et régression (AC: 1 à 4)**
  - [x] Tests unitaires complets du reducer, coordinateur, mauvais reçu, retry identique, conflit et 100 opérations sous budgets
  - [x] Tests d'intégration du stockage, contrats serveur et absence de fuite ; conserver les canaris PostgreSQL 1.7
  - [x] E2E sur les quatre projets : clavier, tactile/pointeur, annonces, retry même commande, choix conflit, axe, zoom 200 %, reflow 320 px et budgets <100/<500 ms
  - [x] Exécuter `npm run ci:all` et documenter les preuves réelles avant passage en `review`

### Review Findings

- [x] [Review][Patch] Publier `saving` avant IndexedDB et convertir tout échec de persistance en état stable sans rejet non géré [`src/shared/mutations/mutation-coordinator.ts`:44]
- [x] [Review][Patch] Refuser un reçu malformé/non corrélé par un échec réessayable au lieu de laisser la commande en attente indéfiniment [`src/shared/mutations/mutation-coordinator.ts`:100]
- [x] [Review][Patch] Rendre le reçu autoritatif même si le nettoyage local échoue, sans afficher un faux échec ni perdre la possibilité de purge [`src/shared/mutations/mutation-coordinator.ts`:104]
- [x] [Review][Patch] Refuser les soumissions concurrentes qui réutilisent un `commandId` et corréler `onChange` avec l'identité de commande [`src/shared/mutations/mutation-coordinator.ts`:44]
- [x] [Review][Patch] Vérifier l'acteur avant `keepRemote`/`abandon` et interdire l'abandon d'une commande encore en vol [`src/shared/mutations/mutation-coordinator.ts`:65]
- [x] [Review][Patch] Verrouiller l'arbitrage contre les doubles activations, clôturer l'ancien conflit et suivre le nouveau `commandId` [`src/shared/mutations/mutation-coordinator.ts`:72]
- [x] [Review][Patch] Remplacer atomiquement l'intention conflictuelle, renouveler son TTL et valider que la fabrique préserve acteur, type, agrégats et payload [`src/shared/mutations/mutation-coordinator.ts`:75]
- [x] [Review][Patch] Ajouter une API de restauration des intentions persistées afin que la reprise soit atteignable après rechargement [`src/shared/mutations/mutation-coordinator.ts`:40]
- [x] [Review][Patch] Valider strictement le snapshot distant avant de l'exposer ou de réutiliser ses versions [`src/shared/mutations/mutation-coordinator.ts`:112]
- [x] [Review][Patch] Imposer les clés exactes, un TTL borné et l'absence de champs sensibles dans toute intention persistée [`src/shared/mutations/contracts.ts`:112]
- [x] [Review][Patch] Interdire explicitement la persistance/reprise hors ligne des commandes d'achat, crédit et récompense [`src/shared/mutations/contracts.ts`:52]
- [x] [Review][Patch] Purger sans exception les entrées IndexedDB primitives ou structurellement corrompues en utilisant la clé de lecture connue [`src/shared/mutations/indexed-db-pending-intent-store.ts`:81]
- [x] [Review][Patch] Réinitialiser une ouverture IndexedDB rejetée et fermer la connexion sur `versionchange` [`src/shared/mutations/indexed-db-pending-intent-store.ts`:49]
- [x] [Review][Patch] Rendre remplacement, suppression et purge atomiques face aux autres onglets [`src/shared/mutations/indexed-db-pending-intent-store.ts`:104]
- [x] [Review][Patch] Ajouter abandon explicite pour les erreurs définitives, IDs de dialogue uniques, message de conflit stable et focus de repli connecté [`src/shared/mutations/mutation-feedback.tsx`:16]
- [x] [Review][Patch] Ajouter l'adaptateur qui convertit réellement `LibraryViewStateReceipt.revision` en `MutationReceipt.resultVersions` [`src/modules/library/application/library-view-state.ts`:12]
- [x] [Review][Patch] Prouver les budgets avec IndexedDB et 100 éléments rendus, le zoom/reflow et un focus à deux tons [`tests/e2e/sauvegarde-fiable.spec.ts`:42]
- [x] [Review][Patch] Prouver le chemin réel commit serveur puis réponse perdue puis reçu `replayed` [`tests/integration/database-library-view-state-canary.mjs`:110]

## Notes de développement

### Structure cible

```text
src/shared/mutations/
  mutation-feedback.ts
  mutation-coordinator.ts
  pending-intent-store.ts
  indexed-db-pending-intent-store.ts
  mutation-feedback.tsx
src/app/_fixtures/mutation-feedback/page.tsx
```

Les noms peuvent être ajustés aux frontières réelles, mais le domaine/reducer ne dépend ni de React, ni de Next, ni d'IndexedDB. Le composant client ne connaît ni PostgreSQL ni Supabase. La fixture est une preuve d'interface, pas une API publique.

Les identifiants de nouvelles commandes sont des UUIDv7 applicatifs. Réutiliser ou extraire un générateur compatible navigateur ; ne pas utiliser `crypto.randomUUID()` (UUIDv4) et ne pas ajouter de dépendance.

### Continuité avec Story 1.7

- Réutiliser `ConfirmLibraryViewStateCommand`, `confirmLibraryContext`, `LibraryViewStateRepository` et le registre `library_view_state_receipts`.
- Ne jamais traiter `resumeLibraryContext`, Realtime ou un état optimiste comme preuve d'écriture.
- Le hash 1.7 couvre toute l'enveloppe ; un retry réseau ne doit donc muter aucun champ.
- Les erreurs fournisseur restent mappées vers des codes stables, sans UUID utilisateur/cible dans logs, URL, HTML ou télémétrie.
- La projection canonique réelle est livrée par Story 2.3 ; son rendu et son focus exact/ajusté restent sous responsabilité Story 3.2.

### Contraintes de versions

Conserver Node `24.18.0`, Next `16.2.12`, React `19.2.8`, `pg` `8.16.3`, Supabase CLI `2.101.0`, `@supabase/ssr` `0.12.3` et Playwright `1.62.1`. Ne pas ajouter de dépendance pour IndexedDB, reducer, dialogue ou machine d'état.

### Non-objectifs

- Première mutation réelle de rangement, catalogue, lecture, média, économie ou personnalisation.
- File hors ligne automatique pour achats/crédits, synchronisation en arrière-plan ou résolution silencieuse dernier-écrivain-gagne.
- Données produit fictives, deep links privés, identifiants ou payloads dans l'URL/SSR/logs.
- Nouveau registre de reçus, nouvelle connexion Supabase côté client ou accès direct à PostgreSQL.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md#Story-18--Percevoir-et-reprendre-chaque-sauvegarde`]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-6--Commandes-concurrence-et-hors-ligne`]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md#Error-Prevention--Recovery`]
- [Source : `_bmad-output/implementation-artifacts/1-7-reprendre-le-dernier-contexte-confirme.md`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Analyse produit/UX, architecture/concurrence et intégration/tests déléguée en parallèle le 2026-08-06.
- Aucun `project-context.md` trouvé ; epics, PRD, architecture, UX et Story 1.7 font autorité.
- Implémentation distribuée entre noyau/persistance, reçu serveur et interface/E2E ; intégration et correctifs de revue locale effectués dans le fil principal.

### Completion Notes List

- Coordinateur générique livré avec séparation confirmé/optimiste, corrélation stricte des reçus, retry immuable, conflit explicite et sérialisation par agrégat.
- Intention non confirmée persistable via IndexedDB natif, validée par schéma/TTL/acteur et isolée entre comptes ; UUIDv7 navigateur sans dépendance.
- `MutationFeedback` livre les états textuels, le dialogue modal accessible, le focus initial et sa restitution ; fixture strictement gardée par `ENABLE_E2E_HARNESS=1`.
- Reçu Story 1.7 autocorrélable sans changement du registre, du hash, de RLS ou de l'idempotence.
- Les 18 constats de la revue adversariale ont été corrigés : durcissement du coordinateur, stockage atomique, restauration, sécurité des intentions, arbitrage accessible et preuves réelles.
- `npm run ci:all` vert le 2026-08-06 en 930,7 s : 169 unités, 35 intégrations, 11 fuites, PostgreSQL réel, restauration, 4 projets Playwright, budgets, build et mutations négatives.

### File List

- `_bmad-output/implementation-artifacts/1-8-percevoir-et-reprendre-chaque-sauvegarde.md` (créé)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
- `playwright.config.ts` (modifié)
- `src/app/%5F_e2e__/sauvegarde/page.tsx` (créé)
- `src/app/__e2e__/sauvegarde/page.tsx` (créé)
- `src/app/__e2e__/sauvegarde/save-harness.tsx` (créé)
- `src/app/globals.css` (modifié)
- `src/modules/library/adapters/postgres-library-view-state.ts` (modifié)
- `src/modules/library/application/library-view-state.ts` (modifié)
- `src/modules/library/domain/library-view-state.ts` (modifié)
- `src/shared/mutations/contracts.ts` (créé)
- `src/shared/mutations/index.ts` (créé)
- `src/shared/mutations/indexed-db-pending-intent-store.ts` (créé)
- `src/shared/mutations/mutation-coordinator.ts` (créé)
- `src/shared/mutations/mutation-feedback.tsx` (créé)
- `src/shared/mutations/mutation-state.ts` (créé)
- `src/shared/mutations/pending-intent-store.ts` (créé)
- `src/shared/mutations/uuid-v7.ts` (créé)
- `tests/e2e/sauvegarde-fiable.spec.ts` (créé)
- `tests/integration/database-library-view-state-canary.mjs` (modifié)
- `tests/integration/library-view-state-contract.test.mjs` (modifié)
- `tests/integration/pending-intent-store-contract.test.mjs` (créé)
- `tests/unit/library-view-state.test.mjs` (modifié)
- `tests/unit/reliable-mutation.test.mjs` (créé)

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-06 | Story créée et contextualisée, statut `ready-for-dev`. |
| 2026-08-06 | Coordinateur, persistance, feedback accessible, reçus corrélés et preuves complètes livrés ; story passée en `review`. |
| 2026-08-06 | Revue adversariale clôturée : 18 correctifs appliqués, CI complète verte, Story 1.8 et Epic 1 terminés. |
