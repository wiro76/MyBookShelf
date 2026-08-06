---
baseline_commit: eb762a2cc67de2ee287ca3d0bcceb01f66dc071f
---

# Story 1.7 : Reprendre le dernier contexte confirmé

Status: review

## Story

En tant que Zan,
je veux revenir à ma dernière position,
afin de retrouver naturellement ma place dans la bibliothèque.

**Traçabilité :** CAP-1, CAP-11, CAP-12 ; FR-2, FR-28, FR-29 ; NFR-1, NFR-3, NFR-8, NFR-9 ; AD-5, AD-6, AD-10, AD-11.

Cette story prolonge la route privée livrée par la story 1.6. Elle pose le contrat durable de `LibraryViewState` avant que les stories 3.x ne livrent le meuble complet. Elle restaure une position de navigation confirmée ; elle ne crée, déplace, réordonne ni répare aucun exemplaire.

## Critères d'acceptation

1. **Étant donné** un contexte confirmé, **quand** Zan revient, **alors** statut, module, étagère et exemplaire sont résolus par identifiants stables et restaurés sans devenir autorité du rangement.
2. **Étant donné** une cible supprimée, **quand** la reprise s'effectue, **alors** le voisin valide le plus proche est ouvert, le changement est annoncé et le focus arrive sur une cible logique.
3. **Étant donné** une session expirée, **quand** Zan se reconnecte, **alors** la destination non sensible est reprise sans donnée privée dans l'URL.
4. **Étant donné** un échec de chargement après connexion, **quand** la reprise échoue, **alors** Zan reste authentifié, voit un état explicite et peut réessayer.

## Décisions tranchées

### Frontières et sens de « confirmé »

| Sujet | Décision |
|---|---|
| Autorité | Le rangement courant fourni par le module `library` est la seule autorité. `LibraryViewState` est un pointeur de navigation reconstructible ; sa lecture ne produit aucun `insert`, `update` ou déplacement dans les tables de rangement. |
| Contexte confirmé | Une ligne serveur écrite dans une transaction authentifiée après validation de la cible contre la projection courante. Aucun état optimiste, cookie, query string, `localStorage` ou IndexedDB ne devient « confirmé ». |
| Périmètre | Un contexte global par utilisateur pour le MVP, repris sur tous ses appareils. Pas de contexte par viewport ou appareil. |
| Version | La ligne porte une `revision bigint` strictement positive et un `confirmed_at`. L'écriture accepte une révision attendue ; une divergence retourne un conflit stable sans écraser silencieusement. L'interface de conflit appartient à 1.8. |
| Idempotence | Toute confirmation porte `commandId` et un hash SHA-256 canonique de la demande. Le registre `library.library_view_state_receipts` rend un rejeu identique sans nouvelle révision et refuse la réutilisation du même `commandId` avec une autre charge. |
| Persistance | La story livre le cas d'usage de confirmation et son adaptateur PostgreSQL. Les futurs composants de navigation l'appelleront après une navigation validée. Elle ne fabrique pas de faux livres pour déclencher cette écriture aujourd'hui. |
| Destination après auth | La route publique reste uniquement `/bibliotheque`. Les identifiants de statut, module, étagère et exemplaire ne transitent jamais dans l'URL, le cookie d'authentification ou les logs. |
| Caches | Route et lecture privées restent `force-dynamic`, `revalidate = 0`, `force-no-store`. Aucun contexte inter-utilisateur ne peut être partagé par cache. |

### Modèle de données imposé

Créer `library.library_view_states` dans `supabase/migrations/20260806000200_library_view_state_expand.sql` :

| Colonne | Contrat |
|---|---|
| `user_id uuid primary key` | FK `auth.users(id) on delete cascade`, ownership du contexte. |
| `status text not null` | Valeurs exactes `want-to-read`, `finished`, `reading`. |
| `module_id uuid` | Identifiant stable mémorisé, nullable tant que le meuble n'existe pas. |
| `shelf_id uuid` | Nullable ; exige `module_id` lorsqu'il est présent. |
| `copy_id uuid` | Nullable ; exige `shelf_id` lorsqu'il est présent. |
| `module_position integer` | Indice observé >= 0, nullable avec `module_id`. Indice de repli uniquement. |
| `shelf_position integer` | Indice observé >= 0, nullable avec `shelf_id`. |
| `item_position integer` | Indice observé >= 0, nullable avec `copy_id`. |
| `revision bigint not null` | >= 1, incrémentée atomiquement. |
| `confirmed_at timestamptz not null` | Horodatage serveur. |

Contraintes de cohérence : un identifiant et son indice sont tous deux nuls ou tous deux présents ; la hiérarchie ne saute aucun niveau. Ne créer aucune table factice `Module`, `Shelf`, `Copy` ou `Placement` : ces agrégats seront livrés par les stories 3.x/4.x et `LibraryViewState` devra alors les résoudre via un port, sans migration de sens.

Activer RLS, accorder seulement `select`, `insert`, `update` à `authenticated`, et utiliser des politiques `to authenticated` symétriques avec `(select auth.uid()) = user_id`. La suppression directe est interdite afin de préserver la monotonie des révisions et la cohérence des reçus. Index supplémentaire inutile : `user_id` est déjà la clé primaire.

Créer aussi `library.library_view_state_receipts(user_id uuid, command_id uuid, request_sha256 text, result_revision bigint, created_at timestamptz default now(), primary key (user_id, command_id))`, avec FK utilisateur, hash hexadécimal de 64 caractères, révision positive et la même isolation RLS. Ce registre appartient au protocole de mutation AD-6 ; il ne contient aucun libellé, titre ni identifiant de cible en clair.

### Résolution déterministe

Le domaine reçoit le contexte mémorisé et une projection courante ordonnée de cibles :

```ts
type LibraryResumeTarget = {
  status: "want-to-read" | "finished" | "reading";
  moduleId: string;
  shelfId: string;
  copyId: string;
  modulePosition: number;
  shelfPosition: number;
  itemPosition: number;
};
```

Règles, dans cet ordre :

1. si `copyId` existe encore, restaurer son emplacement canonique courant ; si son chemin a changé, marquer la reprise ajustée sans réécrire le rangement ;
2. si l'exemplaire a disparu, dans la même étagère choisir l'élément dont `itemPosition` est le plus proche, puis le plus petit indice en cas d'égalité ;
3. sinon, dans le même module, choisir l'étagère la plus proche de `shelfPosition`, puis l'élément le plus proche de `itemPosition` ;
4. sinon, dans le même statut, choisir le module le plus proche de `modulePosition`, puis étagère et élément selon la même règle ;
5. sinon, choisir la première cible du statut mémorisé ; s'il est vide, la première cible selon l'ordre `finished`, `want-to-read`, `reading` ;
6. si aucune cible n'existe, rendre un état vide focalisable sur le titre de la bibliothèque, jamais une erreur.

Tout repli différent de la cible exacte porte `adjusted: true` et un message stable, sans identifiant privé : « Ta dernière place n'existe plus. La position disponible la plus proche est ouverte. » L'algorithme doit être pur, stable quel que soit l'ordre d'entrée et ne muter aucun tableau reçu.

### UX et accessibilité

| État | Contrat |
|---|---|
| Chargement | Le `loading.tsx` conserve une géométrie stable et ne montre aucun faux livre. |
| Cible exacte | Le statut/module/étagère courant sont exposés sémantiquement ; la cible reçoit le focus une seule fois après hydratation. Aucune annonce de correction. |
| Cible ajustée | Région `role="status"` polie avec le message stable ; focus programmatique sur la cible choisie, visible et non masqué. |
| Aucun contexte | Défaut déterministe ; aucune alerte. Si aucune cible n'existe, titre focalisable et texte d'état vide. |
| Erreur de reprise | Conserver la session, afficher « Ta bibliothèque n'a pas pu reprendre sa dernière position. » et une commande `Réessayer` vers `/bibliotheque`. Ne jamais rediriger vers `/connexion` pour une panne DB. |
| Session expirée | Réutiliser exactement la garde 1.6 et la destination littérale `/bibliotheque`. Aucun identifiant privé dans URL, HTML sérialisé, logs ou télémétrie. |

Les quatre projets Playwright restent obligatoires. Focus visible >= 3:1, commandes >= 44 px pointeur et 48 px tactile, zoom 200 %, reflow 400 %/320 px et espacement WCAG 1.4.12 sans débordement.

### Erreurs stables

- `LIBRARY_VIEW_STATE_INVALID`
- `LIBRARY_VIEW_STATE_CONFLICT`
- `LIBRARY_VIEW_STATE_TARGET_MISSING`
- `LIBRARY_VIEW_STATE_UNAVAILABLE`
- `LIBRARY_VIEW_STATE_COMMAND_REUSED`

Les erreurs fournisseur ne traversent ni le cas d'usage ni l'interface. Les logs utilisent seulement `operation`, `outcome`, codes expurgés et corrélation existante ; aucun UUID de contexte ou d'utilisateur en clair.

## Tâches / Sous-tâches

- [x] **T1 — Modèle `LibraryViewState` privé (AC: 1, 3)**
  - [x] Créer la migration imposée, les contraintes hiérarchiques, le registre de reçus, privilèges et politiques RLS ; migration forward-only à 14 chiffres
  - [x] Ajouter `supabase/tests/database/library-view-state-rls.test.sql` : propriétaire create/read/update, suppression directe refusée, autre utilisateur invisible/refusé, `anon` sans privilège, contraintes invalides refusées
  - [x] Ajouter le test pgTAP au tableau explicite du harnais ; ne pas compter sur une découverte de fichiers inexistante

- [x] **T2 — Domaine de résolution pur (AC: 1, 2)**
  - [x] Créer `src/modules/library/domain/library-view-state.ts` avec types stricts, validation UUID/indices/statuts et algorithme déterministe imposé
  - [x] Prouver par tests unitaires : cible exacte, suppression copy/shelf/module/status, égalité, entrée désordonnée, contexte absent, bibliothèque vide, immutabilité des entrées
  - [x] Vérifier qu'aucune résolution ne fabrique ou ne modifie un placement

- [x] **T3 — Persistance et cas d'usage serveur (AC: 1, 2, 4)**
  - [x] Créer un port `LibraryViewStateRepository` sous `application`, puis l'adaptateur node-postgres sous `adapters`
  - [x] Lire et confirmer dans `authenticatedTransaction` avec ownership applicatif `where user_id = $1` plus RLS ; SQL paramétré uniquement
  - [x] Validation cible avant écriture, upsert à révision attendue, reçu idempotent et conflit atomique ; aucun dernier-arrivé-gagne silencieux
  - [x] Un même `commandId` + hash rend le reçu existant, même après évolution de projection ; un même `commandId` + autre hash retourne `LIBRARY_VIEW_STATE_COMMAND_REUSED`
  - [x] Distinguer absence de contexte, bibliothèque vide et indisponibilité ; journaliser sans identifiants privés

- [x] **T4 — Reprise dans la route privée (AC: 1 à 4)**
  - [x] Faire composer `/bibliotheque` par le module `library` après `getVerifiedSession()`, sans régression du résumé privé 1.6
  - [x] Créer le contrat accessible de reprise exact/ajusté et les surfaces actuellement atteignables vide/indisponible avec commande `Réessayer`
  - [x] Le composant client minimal ne gère que focus/annonce post-hydratation ; les données privées restent chargées côté serveur
  - [x] Garantir qu'une panne session reste distincte d'une panne contexte et qu'aucun identifiant ne rejoint l'URL

- [x] **T5 — Preuves réelles et sécurité (AC: 1 à 4)**
  - [x] Ajouter `tests/integration/database-library-view-state-canary.mjs` au job DB : deux utilisateurs réels, RLS, persistance/reconnexion, conflit, rejeu après déplacement, double confirmation concurrente et repli après suppression simulée dans la projection
  - [x] Étendre les E2E sur les quatre projets pour expiration/reconnexion, URL/DOM privés et retry sans déconnexion ; prouver séparément repli par canari DB et focus/annonce par contrat d'intégration jusqu'à la projection réelle 3.x
  - [x] Ajouter une mutation CI de politique RLS ou d'ownership à la porte `database`, exécutée réellement et restaurée en `finally`
  - [x] Ajouter une vérification de fuite pour le message et les logs de reprise

- [x] **T6 — Régression et documentation (AC: 1 à 4)**
  - [x] Exécuter lint, types, unités, intégrations, fuite, database, E2E, budgets, build et mutations
  - [x] Vérifier 100 cibles : résolution déterministe sous les budgets existants ; aucun chevauchement ou ordre modifié puisque la reprise est en lecture seule
  - [x] Mettre à jour le registre de fichiers et les notes de complétion sans annoncer les composants de meuble non encore livrés

## Notes de développement

### État actuel des fichiers à modifier

| Fichier | État actuel | Changement | À préserver |
|---|---|---|---|
| `src/app/bibliotheque/page.tsx` | Garde session 1.6, résumé privé, états session/DB distincts, retry | Composer le résultat de reprise après la garde | Aucune lecture avant session, no-store, panne Auth ≠ anonyme, retry sans déconnexion |
| `src/modules/identity/application/private-library.ts` | Lecture témoin profil/notes par transaction authentifiée | Ne pas y placer le domaine bibliothèque ; au plus conserver son résumé dans la composition | Double barrière ownership + RLS, logs expurgés |
| `src/modules/identity/application/session.ts` | `getUser()` serveur borné, cookies SSR et refresh proxy | Réutiliser sans réimplémenter | Jamais `getSession()` comme preuve d'identité |
| `scripts/run-database-gates.mjs` | Liste pgTAP/canaris explicite et pile GoTrue réelle | Ajouter le test et le canari 1.7 | Ports éphémères, arrêt `finally`, CLI 2.101.0 |
| `tests/e2e/connexion.spec.ts` | Session simulée, quatre projets, privacy/focus/reflow | Étendre ou créer un fichier reprise ciblé | Le job browser ne démarre pas Supabase |
| `scripts/verify-ci-mutations.mjs` | Mutations exécutées avec restauration | Ajouter une mutation database 1.7 | Restauration garantie, aucune nouvelle porte CI |

### Structure de code

```text
src/modules/library/
  domain/library-view-state.ts
  application/resume-library-context.ts
  application/confirm-library-context.ts
  adapters/postgres-library-view-state.ts
  ui/library-resume-focus.tsx
```

`app` compose seulement. Le domaine ne dépend ni de React, ni de Next, ni de `pg`. L'application dépend de ports. L'adaptateur PostgreSQL est le seul à connaître les noms SQL.

### Continuité avec les stories précédentes

- Story 1.6 a durci la session, le refresh proxy, les cookies et `authenticatedTransaction`. Les réutiliser ; ne pas créer de second client Auth ou Pool.
- Story 1.5 impose que la nouvelle table et ses preuves survivent au drill de restauration. Le canari recovery vérifie déjà l'historique et les données ; ne pas exclure le schéma `library` des dumps.
- Story 1.8 ajoutera les retours « Sauvegarde…/Enregistré », les reçus idempotents et le choix de conflit local/distant. Ne pas anticiper ces composants ici.

### Contraintes de versions et documentation actuelle

- Conserver Node `24.18.0`, Next `16.2.12`, React `19.2.8`, `pg` `8.16.3`, Supabase CLI `2.101.0`, `@supabase/ssr` `0.12.3` et Playwright `1.62.1` verrouillés par le dépôt.
- Next App Router rend les pages en Server Components par défaut ; réserver un Client Component au focus post-hydratation.
- PostgreSQL 17 RLS est en default-deny sans politique ; le propriétaire de table contourne normalement RLS, d'où le rôle `authenticated` posé par `authenticatedTransaction`.
- Les politiques utilisent `to authenticated` et `(select auth.uid())`, conformément aux recommandations Supabase et aux migrations existantes.

### Tests attendus

**Unitaires :** résolution pure et bornes de validation, au moins 100 cibles, stabilité/immutabilité.

**Intégration :** repository avec doubles de client, cas absent/erreur/conflit/rejeu/réutilisation hostile, contrat exact des requêtes paramétrées.

**Base réelle :** migration depuis zéro, pgTAP RLS sous deux identités, canari applicatif via le vrai chemin `authenticatedTransaction`.

**E2E :** quatre projets Playwright ; reprise après auth, privacy URL/DOM, panne sans déconnexion, annonce/focus du repli, reflow et zoom.

**Mutations :** policy permissive ou ownership retiré doit faire échouer `ci:database`.

### Non-objectifs

- Tables et UI réelles de `Module`, `Shelf`, `Copy`, `Placement` ; meuble 3D ; ajout de livres ; déplacement.
- Feedback global de sauvegarde, reprise d'intention hors ligne et arbitrage de conflit, réservés à 1.8.
- Inscription, mot de passe oublié, téléphone, deep link privé, identifiant de cible dans l'URL.
- Faux livres ou seed produit dans l'interface.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md#Story-17--Reprendre-le-dernier-contexte-confirmé`]
- [Source : `_bmad-output/specs/spec-my-bookshelf/SPEC.md#CAP-1--Accès-privé-et-reprise`]
- [Source : `_bmad-output/planning-artifacts/prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md#FR-2--Retour-au-dernier-contexte`]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-5--Rangement-atomique`]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md#Error-Prevention--Recovery`]
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL 17 — Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Contexte produit/UX, architecture/code et données/tests analysé en parallèle le 2026-08-06.
- Aucun `project-context.md` trouvé ; SPEC, architecture spine, epics, PRD, UX et stories 1.5/1.6 font autorité.

### Completion Notes List

- Moteur pur de résolution livré : cible exacte, déplacement canonique, replis hiérarchiques déterministes, état vide et validation stricte.
- Persistance privée livrée sous double barrière ownership + RLS, avec révision attendue, reçus SHA-256, rejeu après évolution de projection et concurrence identique idempotente.
- Suppression directe du signet interdite afin de ne jamais réinitialiser une révision en conservant des reçus historiques.
- Route `/bibliotheque` composée après session vérifiée, avec état indisponible explicite, retry sans déconnexion et focus/annonce post-hydratation.
- Limite assumée : la projection produit reste vide tant que Module/Shelf/Copy/Placement ne sont pas livrés par les stories 3.x ; aucun faux rangement n'a été introduit. Les chemins exact/ajusté sont prouvés par domaine + PostgreSQL réel, et le comportement focus/annonce par contrat d'intégration.
- Audit adversarial par sous-agent intégré : correction du rejeu après déplacement, de la course concurrente et ajout de l'observabilité expurgée.
- `npm run ci:all` vert le 2026-08-06 en 711 s, incluant quatre projets Playwright, base réelle, restauration, build et 17 mutations négatives détectées.

### File List

- `_bmad-output/implementation-artifacts/1-7-reprendre-le-dernier-contexte-confirme.md` (créé)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
- `scripts/run-database-gates.mjs` (modifié)
- `scripts/verify-ci-mutations.mjs` (modifié)
- `src/app/bibliotheque/page.tsx` (modifié)
- `src/modules/library/adapters/postgres-library-view-state.ts` (créé)
- `src/modules/library/application/library-view-state.ts` (créé)
- `src/modules/library/domain/library-view-state.ts` (créé)
- `src/modules/library/ui/library-resume-focus.tsx` (créé)
- `supabase/migrations/20260806000200_library_view_state_expand.sql` (créé)
- `supabase/tests/database/library-view-state-rls.test.sql` (créé)
- `tests/e2e/reprise-contexte.spec.ts` (créé)
- `tests/integration/database-library-view-state-canary.mjs` (créé)
- `tests/integration/library-view-state-contract.test.mjs` (créé)
- `tests/leak/observability-leak.test.mjs` (modifié)
- `tests/unit/library-view-state.test.mjs` (créé)

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-06 | Story créée et contextualisée, statut `ready-for-dev`. |
| 2026-08-06 | Implémentation, audit adversarial et `ci:all` terminés ; story passée en `review`. |
