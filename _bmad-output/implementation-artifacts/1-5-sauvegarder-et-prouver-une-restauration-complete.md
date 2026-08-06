---
baseline_commit: eb762a2cc67de2ee287ca3d0bcceb01f66dc071f
---

# Story 1.5 : Sauvegarder et prouver une restauration complète

Status: done

## Story

En tant que Zan,
je veux que mes données et images soient restaurables ensemble,
afin de reprendre après un incident sans référence cassée.

**Traçabilité :** CAP-12 ; NFR-1, NFR-8 ; AD-8, AD-12.

Story d'exploitation sans surface utilisateur. Elle doit livrer une preuve exécutable de reprise base + Storage, pas seulement documenter `pg_dump` ni vérifier des chaînes de commande.

## Critères d'acceptation

1. **Étant donné** la stratégie de sauvegarde, **quand** elle s'exécute, **alors** PITR est utilisé s'il est disponible, sinon sauvegarde quotidienne, avec export logique et copie Storage hors site.
2. **Étant donné** un point de sauvegarde, **quand** il est finalisé, **alors** un manifeste immuable liste les hashes Storage référencés par la base et sa vérification échoue sur toute incohérence.
3. **Étant donné** une restauration trimestrielle, **quand** le runbook est exécuté, **alors** base et objets sont restaurés, toutes les références sont vérifiées et une preuve horodatée est conservée.
4. **Étant donné** que RPO, RTO et rétention ne sont pas encore chiffrés, **quand** le développement du MVP avance, **alors** il n'est pas bloqué ; la promotion en production reste bloquée jusqu'à leur fixation et à une restauration probante.

## Décisions tranchées

Ces décisions lèvent les ambiguïtés d'implémentation sans préjuger des objectifs d'exploitation que Zan doit encore approuver.

### Portée et cohérence

| Sujet | Décision |
|---|---|
| Nature du point | Un point réunit toujours la protection plateforme (`pitr` si activé, sinon `daily`), un export logique PostgreSQL et une copie de tous les objets Storage inventoriés. PITR ne remplace jamais l'export ni la copie Storage. |
| Cohérence DB/Storage | Maintenir jusqu'à finalisation une barrière de maintenance vérifiable bloquant écritures applicatives, workers, médias et migrations. Inventorier Storage avant et après l'export ; toute variation, écriture concurrente ou perte de la barrière annule le point. |
| Inventaire initial | Tant que le domaine `media` n'existe pas, `storage.objects` est l'inventaire conservateur de référence. Tous ses objets sont sauvegardés. Les stories 2.4, 2.6 et 2.7 devront joindre leurs références métier à cette vérification sans remplacer le contrat de manifeste. |
| Hash | Le SHA-256 est calculé sur les octets copiés. Ne jamais faire confiance à l'ETag S3, qui n'est pas un hash de contenu fiable en multipart. Les futurs objets AD-8 portent aussi ce SHA-256 dans leur clé adressée par contenu. |
| Objet orphelin | Un objet présent dans le point mais absent de l'inventaire final fait échouer la finalisation. Un objet supplémentaire trouvé sur la source après la fenêtre signale une reprise des écritures et fait également échouer le point. |
| Cible de restauration | Toujours une pile jetable vide, isolée et distincte de la source. Le script refuse une cible `production`, un fingerprint identique à la source et toute restauration destructive implicite. |
| Production | Une PR et la CI n'accèdent jamais à la production. Un exercice portant des données de production reste dans une frontière de reprise protégée appartenant à l'environnement production. |
| Hors site | Un autre bucket du même projet n'est pas hors site. Avant production, la destination doit être dans un compte ou projet distinct, avec credentials distincts, chiffrement et protection contre l'écrasement. Le harnais CI simule ce port par un répertoire temporaire séparé. |
| Port hors site | Contrat minimal `putExclusive`, `read`, `list`, `verifyRetention`. En production, refuser l'adaptateur filesystem, une destination du même projet, une rétention invérifiable ou une destination réinscriptible. |
| Scope métier | Ne créer aucune table `MediaAsset`, `Work`, `Edition`, `Copy`, `UserWork` ou `Reading`. Le canari crée ses références uniquement dans la pile jetable et les supprime avec elle. |

### Manifeste v1

Le point finalisé porte exactement cette structure logique :

```text
<backup-id>/
  database/roles.sql
  database/schema.sql
  database/data.sql
  database/history-schema.sql
  database/history-data.sql
  objects/<sha256>
  manifest.json
  manifest.sha256
```

`manifest.json` est du JSON UTF-8 canonique : clés et tableaux dans un ordre déterministe, aucune indentation dépendante de la plateforme, chemins relatifs POSIX. Schéma minimal :

```json
{
  "schemaVersion": 1,
  "backupId": "uuid",
  "createdAt": "UTC ISO-8601",
  "sourceEnvironment": "local|preview|staging|production",
  "sourceFingerprint": "valeur publique non secrète",
  "platformBackupMode": "pitr|daily",
  "postgresMajor": 17,
  "supabaseCliVersion": "2.101.0",
  "database": [{ "path": "database/roles.sql", "sha256": "64 hex", "bytes": 1 }],
  "objects": [{ "bucket": "id", "key": "clé", "archivePath": "objects/64hex", "sha256": "64 hex", "bytes": 1 }]
}
```

Invariants non négociables :

- `backupId` et le dossier sont créés exclusivement ; aucune reprise ni écrasement d'un point finalisé. Le harnais filesystem simule cette immutabilité et écrit le marqueur final en dernier ; seul le stockage hors site protégé fait autorité en production.
- Chaque chemin est relatif, normalisé, sans `..`, chemin absolu, lien symbolique ni échappement du dossier du point.
- Les couples `(bucket, key)`, chemins d'archive et hashes sont uniques ou dédupliqués uniquement si les octets sont identiques.
- Les entrées `database` sont triées par `path`, les entrées `objects` par `(bucket, key)`, et toute taille est un entier supérieur ou égal à zéro. Une clé Storage est une valeur opaque validée séparément d'un chemin filesystem local.
- `manifest.sha256` authentifie l'intégrité accidentelle du manifeste ; la destination hors site fournit l'immutabilité/WORM. Ce digest n'est pas présenté comme une signature d'origine.
- Aucun secret, URL de connexion, URL signée, e-mail, titre, contenu utilisateur ou chemin absolu local dans le manifeste ou la preuve.
- Un point n'est visible comme finalisé qu'après vérification réussie de tous les exports, objets, tailles et hashes ; le marqueur final est écrit en dernier.

### Export et restauration

| Sujet | Décision |
|---|---|
| Outil | Réutiliser `npx --yes supabase@2.101.0`, déjà épinglé par le harnais. Ne pas installer de SDK de sauvegarde. |
| Export | Produire `roles.sql`, `schema.sql`, puis `data.sql --use-copy --data-only`, en excluant `storage.buckets_vectors` et `storage.vector_indexes` comme la procédure Supabase officielle. Exporter séparément schéma et données de `supabase_migrations` afin de conserver l'historique de déploiement. |
| Restauration | Utiliser le client PostgreSQL 17 et `psql -X --single-transaction --set ON_ERROR_STOP=1`. Un client `pg_dump` plus ancien que le serveur est refusé. |
| Storage | Le port de copie doit pouvoir lister, télécharger et restaurer récursivement. Le harnais utilise Storage local. En production, un client S3 utilise les credentials serveur S3 dédiés ; `supabase storage cp` utilise séparément l'authentification de la CLI Supabase. |
| Cible vide | La cible contient uniquement les schémas plateforme Supabase. Aucune migration, seed ni donnée applicative du dépôt n'est appliquée avant la restauration. |
| Ordre | Vérifier le point avant toute restauration ; restaurer la base et l'historique dans la cible plateforme vide ; réhydrater les objets avec écrasement contrôlé des métadonnées Storage restaurées ; comparer exactement métadonnées, manifeste et octets. Tout échec produit `verdict: failed`, interdit la promotion et détruit la cible jetable : aucun état partiel n'est déclaré restauré. |
| Effets | Cron, webhooks, workers et appels externes restent désactivés pendant l'exercice. Réactiver seulement après vérification et décision opérateur. |
| Dump non fiable | Une archive de source non fiable peut exécuter du SQL. Le runbook n'accepte que les points produits et vérifiés par ce pipeline ; aucune restauration arbitraire téléchargée. |

### Preuve et verrou de promotion

La preuve est un JSON expurgé, conservé dans le même coffre immuable que le point, contenant au minimum : `schemaVersion`, `drillId`, `backupId`, `startedAt`, `completedAt`, `sourceFingerprint`, `targetFingerprint`, `manifestSha256`, `databaseChecks`, `storageChecks`, `durationMs`, versions d'outils, verdict et codes d'échec stables. Elle ne contient jamais les chemins d'objet ni les données restaurées.

Le contrat de politique utilise exactement `rpoMinutes`, `rtoMinutes`, `retentionDays`, `platformBackupMode`, `approvedAt` et `approvedByRole`. Les trois objectifs sont des entiers positifs ; les durées mesurées sont en millisecondes ; le trimestre est un trimestre civil UTC. Aucune valeur proposée n'est préapprouvée par cette story.

Le dépôt contient un contrat de politique avec RPO, RTO et rétention non renseignés. Cette absence est valide pour `local`, `preview` et `staging`, mais la commande de promotion `production` échoue tant que :

1. RPO, RTO et rétention ne sont pas des valeurs positives approuvées et datées ;
2. la stratégie plateforme n'est pas explicitement `pitr` ou `daily` ;
3. aucune preuve complète et réussie du trimestre courant n'est fournie ;
4. la durée mesurée dépasse le RTO approuvé ;
5. la preuve ne correspond pas à un manifeste intact ou à la bonne frontière d'environnement.

La story peut passer à `done` avec ces valeurs encore absentes : le comportement attendu est précisément que le développement continue et que la promotion production soit refusée.

## Tâches / Sous-tâches

- [x] **T1 — Contrats purs du manifeste et de la politique (AC: 1, 2, 4)**
  - [x] Créer `scripts/recovery/manifest.mjs` avec sérialisation canonique v1, calcul SHA-256 en flux, validation stricte du schéma, chemins sûrs et refus des doublons incohérents
  - [x] Créer `scripts/recovery/policy.mjs` : sélection pure `pitr` si disponible sinon `daily`, validation stricte de `rpoMinutes`, `rtoMinutes`, `retentionDays`, `platformBackupMode`, `approvedAt`, `approvedByRole`, et décision de promotion fail-closed par codes stables
  - [x] Tester avant implémentation : ordre différent donnant le même manifeste, manifeste altéré, hash/longueur faux, objet absent ou supplémentaire, collision de chemin, `..`, chemin absolu, symlink, point déjà finalisé
  - [x] Tester que les objectifs absents ne bloquent pas local/preview/staging mais bloquent production, comme une preuve absente, invalide, hors trimestre ou dépassant le RTO

- [x] **T2 — Création d'un point complet (AC: 1, 2)**
  - [x] Créer `scripts/recovery/create-backup.mjs` : valider les variables opérateur, créer un dossier exclusif, inventorier Storage, produire les trois exports SQL, copier les objets par hash et réinventorier avant finalisation
  - [x] Ne passer aucun secret dans les logs, manifestes ou preuves. Les credentials restent des variables du processus opérateur et ne sont pas ajoutés à `src/shared/config/environment.ts`, qui appartient au runtime Next
  - [x] Refuser une source production depuis une PR, preview ou cible non production ; refuser TLS désactivé pour une source distante
  - [x] Exporter aussi `supabase_migrations` dans `history-schema.sql` et `history-data.sql`, puis vérifier chaque SQL et objet par taille + SHA-256 avant d'écrire le marqueur final
  - [x] Documenter que la protection plateforme est un prérequis déclaré : le script enregistre `pitr|daily`, mais ne prétend jamais avoir déclenché PITR localement

- [x] **T3 — Restauration probante vers une cible jetable (AC: 2, 3)**
  - [x] Créer `scripts/recovery/restore-backup.mjs` : vérifier intégralement le point, refuser toute cible dangereuse, restaurer SQL + historique en transaction puis réhydrater les objets sans conflit de métadonnées, et lancer la vérification croisée finale
  - [x] Créer `scripts/run-recovery-gates.mjs` sur le modèle robuste de `run-database-gates.mjs`, avec ports dynamiques, répertoires temporaires contrôlés, CLI 2.101.0 et nettoyage en `finally`
  - [x] Démarrer deux piles Supabase locales isolées : la source applique les migrations, la cible ne contient que la plateforme Supabase sans migrations ni seed du dépôt. Storage doit être actif dans ce harnais dédié sans alourdir `ci:database`
  - [x] Semer une table canari temporaire, un utilisateur Auth et un bucket privé avec objets adressés par SHA-256, dont un objet vide ; sauvegarder, altérer la source, restaurer, puis vérifier connexion Auth réelle, données, RLS, historique de migrations, configuration des buckets, références, octets et hashes
  - [x] Produire une preuve JSON horodatée même en cas d'échec, avec verdict explicite et sans PII. Ne conserver en CI que les fixtures synthétiques et diagnostics d'échec

- [x] **T4 — Porte CI et mutations négatives (AC: 2, 3)**
  - [x] Ajouter `ci:recovery` à `package.json`, à `ci:all` et dans un job CI séparé avec plafond mesuré ; ne jamais lui fournir de secret ni de donnée production
  - [x] Étendre `tests/integration/ci-contract.test.mjs`, `tests/integration/ci-mutation.test.mjs` et `tests/fixtures/ci-gate-mutations.json` : `ci:all` passe explicitement à douze portes et la liste figée reçoit `recovery`
  - [x] Ajouter des tests unitaires rapides du manifeste/politique et un canari réel de restauration ; aucune inspection de texte ne remplace l'exécution du dump, de la copie et de la restauration
  - [x] Étendre `scripts/verify-ci-mutations.mjs` avec une mutation rapide qui neutralise la comparaison SHA-256 et doit être rejetée, sans redémarrer inutilement deux piles dans chaque mutation
  - [x] Mesurer la durée Windows et Linux ; ajuster le job dédié si nécessaire sans réduire les vérifications existantes

- [x] **T5 — Runbook trimestriel et promotion production (AC: 1, 3, 4)**
  - [x] Créer `docs/operations/backup-and-restore.md` : responsabilités, fenêtre sans écriture, création, restauration isolée, vérifications, rollback opérateur, reprise des workers et traitement d'un échec
  - [x] Décrire le déclenchement trimestriel (`workflow_dispatch` et calendrier) sans connecter la PR à un environnement protégé ; les preuves réelles restent hors des artefacts GitHub de courte durée
  - [x] Créer `config/recovery-policy.json` avec objectifs explicitement non approuvés, plus `scripts/verify-recovery-readiness.mjs` utilisé par la promotion production
  - [x] Mettre à jour `docs/operations/environment-promotion.md`, `.env.example` et `.gitignore` : noms des variables opérateur seulement, sauvegardes/preuves locales ignorées, aucune valeur secrète
  - [x] Relier explicitement le futur GC média (story 2.7) aux manifestes encore dans la fenêtre de rétention ; aucun objet référencé par un point retenu n'est supprimable

### Review Findings

- [x] [Review][Patch] Permettre la création et la matérialisation d'un point sur un stockage hors site immuable ; le seul chemin compatible production est actuellement rejeté [scripts/recovery/create-backup.mjs:109]
- [x] [Review][Patch] Attester côté cible son fingerprint et son caractère jetable avant toute destruction, puis rendre le nettoyage d'échec obligatoire [scripts/recovery/restore-backup.mjs:39]
- [x] [Review][Patch] Exiger une preuve complète et vérifier cible, manifeste réel, contrôles DB/Storage et versions avant une promotion production [scripts/recovery/policy.mjs:78]
- [x] [Review][Patch] Refuser un verdict `passed` lorsque le vérificateur DB rend un contrôle faux, vide ou incomplet [scripts/recovery/restore-backup.mjs:85]
- [x] [Review][Patch] Détecter une mutation Storage sous la même clé pendant la fenêtre de sauvegarde, pas seulement un changement d'inventaire nominal [scripts/recovery/create-backup.mjs:145]
- [x] [Review][Patch] Préserver et vérifier les métadonnées Storage au lieu de les remplacer par `application/octet-stream` [scripts/recovery/supabase-ports.mjs:103]
- [x] [Review][Patch] Écrire les preuves exclusivement et les conserver via le coffre immuable plutôt que dans un fichier local écrasable [scripts/recovery/restore-backup.mjs:12]
- [x] [Review][Patch] Imposer exactement les cinq exports SQL requis dans tout manifeste accepté, y compris à la restauration [scripts/recovery/manifest.mjs:97]
- [x] [Review][Patch] Appliquer le contrôle TLS/protocole à toute base distante, pas uniquement aux sources production [scripts/recovery/create-backup.mjs:94]
- [x] [Review][Patch] Relier le canari DB aux références et hashes Storage afin qu'une référence cassée fasse échouer le drill [tests/integration/recovery-drill-canary.mjs:62]
- [x] [Review][Patch] Faire échouer la readiness lorsque `APP_ENV` est absent au lieu de choisir implicitement `local` [scripts/verify-recovery-readiness.mjs:16]
- [x] [Review][Patch] Relier la sélection PITR/daily à la création du point au lieu de faire confiance à une valeur déclarative libre [scripts/recovery/create-backup.mjs:87]
- [x] [Review][Patch] Vérifier réellement les versions serveur, `pg_dump` et `psql` avant d'enregistrer PostgreSQL 17 dans la preuve [scripts/recovery/supabase-ports.mjs:40]
- [x] [Review][Patch] Refuser une approbation future et faire correspondre le rôle approbateur au rôle attendu par le pipeline protégé [scripts/recovery/policy.mjs:67]

## Notes de développement

### Contexte actuel

Il n'existe aucun code de sauvegarde/restauration, manifeste, exercice de reprise ou preuve. La production n'existe pas encore. `docs/operations/environment-promotion.md` porte uniquement le verrou documentaire RPO/RTO/rétention.

Le harnais base actuel exclut `storage-api`. Ne pas le rendre plus lent ni fragiliser les canaris identité/outbox : créer un harnais de reprise séparé, quitte à extraire ensuite uniquement les helpers réellement communs. Le worktree contient des corrections non commitées des stories 1.4 et 1.6 ; les préserver, notamment dans `scripts/verify-ci-mutations.mjs`.

### Fichiers à réutiliser et préserver

| Fichier UPDATE | État actuel | Changement attendu | À préserver |
|---|---|---|---|
| `package.json` | Onze portes composées par `ci:all`; Node 24.18.0 | Ajouter `ci:recovery` | Versions épinglées et ordre des portes existantes |
| `.github/workflows/ci.yml` | Jobs quality/database/browser, 20 min | Job recovery isolé, sans environnement production | Permissions `contents: read`, reproductibilité, autres jobs |
| `scripts/verify-ci-mutations.mjs` | Mutations réelles, déjà modifié par les revues 1.4/1.6 | Mutation hash/politique ciblée | Toutes les mutations existantes et restaurations `finally` |
| `tests/integration/ci-contract.test.mjs` | Contrat CI minimal | Exiger la nouvelle porte | Garanties pull request et absence de contournement |
| `tests/integration/ci-mutation.test.mjs` + fixture | Liste figée des portes mutées | Synchroniser seulement si la porte est ajoutée au contrat | Preuve que le fixture et le script restent cohérents |
| `scripts/run-database-gates.mjs` | Une pile locale, Storage exclu, ports dynamiques, CLI 2.101.0 | Référence ou extraction minimale de helpers | Canaris identité/outbox, nettoyage Windows, durée existante |
| `supabase/config.toml` | PostgreSQL 17, Auth actif, Storage configuré mais exclu du harnais DB | Utiliser Storage dans le harnais recovery | Ports dynamiques et paramètres Auth de 1.6 |
| `docs/operations/environment-promotion.md` | Blocage production seulement documentaire | Rendre le contrôle exécutable | Interdiction des données production en PR |
| `.env.example` | Variables runtime applicatives | Documenter seulement les noms opérateur | Aucun secret ni credential de sauvegarde dans le runtime Next |
| `.gitignore` | Ignore build/tests/env | Ignorer points et preuves locales | Exceptions existantes |

### Exigences de sécurité

- Dumps, objets et manifestes sont des données privées critiques. Ne jamais les committer ni les publier comme artefacts de PR.
- Les credentials Storage S3 serveur contournent RLS : secrets opérateur dédiés, jamais `SUPABASE_ANON_KEY`, jamais exposés au navigateur.
- Une destination hors site appartient à une frontière de production distincte, chiffrée et non réinscriptible ; son fournisseur et ses objectifs restent à approuver avant production.
- Les identifiants de preuve sont des UUID et fingerprints publics. Expurger avec les règles de la story 1.4 ; aucun chemin Storage dans la preuve publiable.
- Une restauration de production ne cible jamais local, preview ou staging avec des données réelles. Le test trimestriel utilise une cible de reprise protégée dans la frontière production.

### Stratégie de tests

**Unitaires :** manifeste canonique, validation de chemins, hash en flux, immutabilité locale, politique PITR/daily, promotion selon environnement, preuve trimestrielle et RTO mesuré.

**Intégration synthétique :** points sur répertoires temporaires, sorties de processus simulées pour chaque échec, absence de secret dans stdout/stderr/manifeste/preuve.

**Canari réel :** deux destinations PostgreSQL/Storage jetables, export logique, suppression/corruption, restauration, vérification DB → objets et hashes. Les données sont synthétiques et n'utilisent aucun futur schéma métier.

**Mutations :** comparaison de hash neutralisée, preuve absente/altérée, objectif non approuvé ; chaque mutation doit être rejetée par une porte rapide et identifiée.

### Versions et informations techniques vérifiées le 2026-08-06

- Supabase CLI : conserver `2.101.0`, autorité actuelle du dépôt.
- PostgreSQL : serveur et clients majeurs 17. `pg_dump` refuse un serveur plus récent que son propre major ; restaurer dans une base vide et utiliser `psql -X` pour ignorer `psqlrc`.
- Supabase : PITR remplace les sauvegardes quotidiennes lorsqu'il est actif. Les backups DB ne contiennent pas les octets Storage. Storage n'offre pas de versioning S3 ; une suppression est définitive sans copie externe.
- La procédure officielle Supabase exporte rôles, schéma et données séparément, avec `--use-copy --data-only` et exclusion des tables vectorielles Storage.
- Le protocole S3 Supabase requiert des credentials serveur dédiés et prend en charge AWS Signature v4. Le harnais peut employer le Storage local ; ne pas implémenter SigV4 à la main.

### Dépendances et enchaînement

- Stories 1.1 à 1.4 fournissent projet, CI, isolation, traitements et observabilité.
- Story 1.6 ajoute Auth mais n'est pas un prérequis conceptuel ; sa présence doit néanmoins survivre au canari de restauration.
- Stories 2.4 et 2.6 enrichiront l'inventaire avec les états média réels.
- Story 2.7 consommera la politique de rétention et les manifestes pour empêcher un GC prématuré.
- Story 1.8 traite le feedback de sauvegarde applicative visible ; ne pas créer d'interface utilisateur ici.

### Hors périmètre

- Fixer ou approuver maintenant les valeurs RPO, RTO et rétention.
- Choisir contractuellement le fournisseur hors site ou sa région.
- Déployer un workflow ayant accès à production depuis une pull request.
- Concevoir l'UI de restauration, les médias métier, leur révocation ou leur GC.
- Sauvegarder les caches reconstruisibles, les réponses fournisseurs Catalogue ou les secrets.
- Haute disponibilité multi-région, réplication active-active et continuité sans interruption.

### Références

- [Source: `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md#Story-15--Sauvegarder-et-prouver-une-restauration-complète`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-8--Ressources-visuelles-ADOPTED`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-12--Livraison-et-exploitation-ADOPTED`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md#8-Exigences-non-fonctionnelles`]
- [Source: `docs/operations/environment-promotion.md`]
- [Source: `scripts/run-database-gates.mjs`]
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase Storage downloads and S3](https://supabase.com/docs/guides/storage/management/download-objects)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Analyse parallèle produit, architecture/exploitation et code/tests achevée le 2026-08-06.
- Aucun `project-context.md` trouvé ; les artefacts planning et les patterns livrés font autorité.
- Plan d'implémentation : TDD par contrats purs, orchestration injectée, canari Supabase isolé, puis intégration CI et runbook.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Les valeurs RPO/RTO/rétention restent volontairement non tranchées ; le gate production doit prouver leur absence aujourd'hui.
- Manifeste v1 canonique, politique fail-closed, orchestration transactionnelle et preuve expurgée livrés en TDD.
- Canari réel validé sur deux piles Supabase 2.101.0/PostgreSQL 17 : Auth, RLS, historique, bucket privé, objet normal et objet vide restaurés avec hashes exacts.
- `ci:recovery` mesuré à 120,5 s sur Windows ; job Linux isolé plafonné à 20 minutes, mesure effective enregistrée par la prochaine exécution GitHub Actions.
- Régression complète validée avec l'environnement local du workflow : 104 E2E, base, recovery, build, budgets et 12 mutations négatives.
- Revue BMAD clôturée : 14/14 correctifs appliqués ; coffre distant immuable, attestation et nettoyage de cible, preuve complète, versions réelles, métadonnées et références Storage validés.
- `ci:all` final vert en 642,9 s le 2026-08-06, avec drill réel `RECOVERY_DRILL_PASSED` et aucun conteneur de reprise orphelin.

### File List

- `_bmad-output/implementation-artifacts/1-5-sauvegarder-et-prouver-une-restauration-complete.md` (créé)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
- `.env.example` (modifié)
- `.github/workflows/ci.yml` (modifié)
- `.gitignore` (modifié)
- `config/recovery-policy.json` (créé)
- `docs/operations/backup-and-restore.md` (créé)
- `docs/operations/environment-promotion.md` (modifié)
- `package.json` (modifié)
- `scripts/recovery/create-backup.mjs` (créé)
- `scripts/recovery/manifest.mjs` (créé)
- `scripts/recovery/policy.mjs` (créé)
- `scripts/recovery/restore-backup.mjs` (créé)
- `scripts/recovery/supabase-ports.mjs` (créé)
- `scripts/run-recovery-gates.mjs` (créé)
- `scripts/verify-ci-mutations.mjs` (modifié)
- `scripts/verify-recovery-readiness.mjs` (créé)
- `tests/fixtures/ci-gate-mutations.json` (modifié)
- `tests/integration/ci-contract.test.mjs` (modifié)
- `tests/integration/ci-mutation.test.mjs` (modifié)
- `tests/integration/recovery-drill-canary.mjs` (créé)
- `tests/integration/recovery-orchestration.test.mjs` (créé)
- `tests/integration/recovery-readiness.test.mjs` (créé)
- `tests/unit/recovery.test.mjs` (créé)

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-06 | Story créée et contextualisée, statut `ready-for-dev`. Analyse produit, architecture, exploitation, code et documentation officielle consolidée. |
| 2026-08-06 | Implémentation complète en TDD : sauvegarde/restauration DB + Storage, preuve, policy production, canari réel à deux piles, CI, mutations et runbooks. Statut `review`. |
| 2026-08-06 | Revue BMAD : 14 correctifs appliqués, drill réel et `ci:all` verts. Statut `done`. |
