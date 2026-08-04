---
baseline_commit: 928c5f67a1759e29649d48988288c8a5e5e71cd9
---

# Story 1.3 : Exécuter les traitements différés sans perte ni doublon

Status: ready-for-dev

## Story

En tant que Zan,
je veux que les traitements en arrière-plan soient reprenables,
afin qu'une panne ne perde ni ne double une action confirmée.

**Traçabilité :** CAP-12 ; NFR-1, NFR-2, NFR-8 ; AD-1, AD-3, AD-6, AD-12.

Cette story ne livre aucune fonctionnalité visible. Elle pose l'infrastructure d'effets différés dont dépendent 2.4 (import de couverture), 2.6/2.7 (publication/révocation et GC des médias), 5.3 et 5.5 (fin de lecture et crédit de récompense). Si elle est bâclée, ces stories réinventeront chacune leur mécanique de reprise.

## Critères d'acceptation

1. **Étant donné** une mutation qui exige un effet différé, **quand** elle est confirmée, **alors** message pgmq/outbox et mutation sont publiés dans la même transaction avec enveloppe versionnée.
2. **Étant donné** Supabase Cron, **quand** il déclenche un Route Handler Node Vercel protégé, **alors** le worker consomme un lot borné sous `maxDuration` avec timeout de visibilité.
3. **Étant donné** un échec transitoire, **quand** le message est rejoué, **alors** retries bornés et consommateur idempotent empêchent tout double effet.
4. **Étant donné** l'épuisement des retries, **quand** le seuil est atteint, **alors** le message rejoint la DLQ avec `messageId`, `jobId`, motif et action de reprise testable.

## Décisions tranchées

Ces points ne sont pas laissés à l'appréciation de l'implémenteur. Toute autre interprétation est un écart à signaler, pas à décider seul.

| Sujet | Décision |
|---|---|
| Emplacement de la logique | La consommation vit dans `src/workers/deferred-effects/`. Le Route Handler n'est qu'un adaptateur HTTP qui authentifie et délègue (AD-2 : aucune règle métier dans la composition web). `src/workers/` existe déjà et figure dans la graine structurelle de l'architecture. |
| Nom des queues | `deferred_effects` et `deferred_effects_dlq`. |
| Seuil de retries | **5**. À chaque `pgmq.read`, si `read_ct > 5`, router en DLQ **sans tenter le traitement**. Cela donne exactement 5 tentatives réelles. |
| `jobId` | Identifiant UUIDv7 de **l'exécution du worker** qui constate l'épuisement, généré à l'entrée du Route Handler. Il n'entre **pas** dans l'enveloppe AD-1 : le message DLQ est une enveloppe distincte = enveloppe d'origine + `jobId` + `failureReason` + `replayAction`. La story 1.4 le propagera vers les logs et traces. |
| Concurrence | `pg_try_advisory_lock` (non bloquant) sur une clé constante documentée. Verrou non obtenu → répondre 200 avec `{ skipped: true }` et sortir. Libérer par `pg_advisory_unlock` en `finally`, avant `release()`. |
| Portée du verrou | Sérialisation **globale** assumée : AD-1 n'exige que l'ordre par agrégat, mais la sérialisation globale est plus simple et suffisante au MVP. |
| Secrets du worker | **Optionnels au build, obligatoires à l'exécution** du Route Handler. Les rendre obligatoires au démarrage casserait `ci:static`. |

## Tâches / Sous-tâches

- [ ] **T1 — Activer pgmq et poser le contrat de publication transactionnelle (AC: 1)**
  - [ ] Migration `supabase/migrations/<14 chiffres>_deferred_effects_expand.sql` (format identique à `20260804000100_ci_canary_expand.sql`) : `create extension if not exists pgmq;`
  - [ ] Créer les deux queues via `pgmq.create()`. Noms en anglais, sans préempter un nom de domaine métier — `database-gates.test.mjs` interdit explicitement `Copy`, `UserWork`, `Reading`
  - [ ] Écrire une fonction SQL `publish_deferred_effect(...)` qui valide l'enveloppe AD-1 **complète** puis appelle `pgmq.send()`. Enveloppe obligatoire et versionnée : `messageId`, `eventType`, `producer`, `aggregateId`, `aggregateVersion`, `payloadVersion`, `occurredAt`, `payload`. Lever une erreur sur toute enveloppe incomplète — un message sans `payloadVersion` est un bug silencieux à la consommation
  - [ ] Table d'idempotence de consommation : contrainte unique sur `messageId` + horodatage de traitement. C'est elle qui garantit l'AC 3
  - [ ] Table `deferred_effect_failures(message_id, read_ct, error_code, error_message, occurred_at)` : sans elle, le motif d'échec est **impossible** à connaître au moment du routage DLQ, puisque la tentative précédente s'est terminée par un `ROLLBACK` qui a tout effacé. Écrite dans une transaction séparée, après le rollback métier
  - [ ] RLS : ni la table d'idempotence, ni `pgmq`, ni la table d'échecs ne sont accessibles au navigateur. Accès `service_role` uniquement, prouvé par pgTAP
  - [ ] Création neuve : une seule migration `expand` suffit. Forward-only, jamais de downgrade dans `supabase/migrations/`

- [ ] **T2 — Worker et Route Handler borné (AC: 2)**
  - [ ] Écrire la logique dans `src/workers/deferred-effects/`, sous forme de **fonction pure importable depuis un test Node**, recevant sa connexion en paramètre. C'est la condition pour que l'AC 2 soit prouvable
  - [ ] Créer `src/app/api/deferred-effects/process/route.ts` — le dossier `src/app/api/` n'existe pas encore. Il authentifie, génère le `jobId`, délègue au worker, rien d'autre
  - [ ] `export const maxDuration = 60`
  - [ ] Protection : comparer `Authorization: Bearer <secret>` à une variable d'environnement dédiée. 401 sans détail en cas d'échec. Ce secret n'est **pas** `SUPABASE_ANON_KEY`
  - [ ] Wrapper Pool/transaction réutilisable dans `src/shared/kernel/` (dossier vide aujourd'hui). Ne pas dupliquer le code de connexion dans le Route Handler
  - [ ] Lot borné : `pgmq.read(queue, vt, qty)` avec `qty` plafonné entre 10 et 20. VT nettement au-dessus de la durée de traitement d'un message, nettement sous `maxDuration`
  - [ ] Arrêt propre : suivre le temps écoulé, sortir de la boucle avec ≈10 s de marge avant `maxDuration`. Les messages non traités redeviennent visibles à l'expiration du VT — ne jamais risquer une coupure en plein `delete`
  - [ ] Verrou de concurrence selon la décision tranchée ci-dessus

- [ ] **T3 — Idempotence et retries bornés (AC: 3)**
  - [ ] Ordre non négociable : insérer le `messageId` dans la table d'idempotence **dans la même transaction que l'effet métier** → `COMMIT` → **puis seulement** `pgmq.delete()`. Supprimer avant le commit perd le message
  - [ ] `messageId` déjà présent → succès sans réappliquer l'effet, puis suppression du message
  - [ ] Borner par `read_ct` selon le seuil tranché. Échec sous le seuil : ne rien supprimer, laisser le VT expirer ou appeler `pgmq.set_vt()` pour un backoff explicite, et journaliser l'erreur dans `deferred_effect_failures`

- [ ] **T4 — DLQ et reprise testable (AC: 4)**
  - [ ] `read_ct > 5` → `pgmq.send()` vers `deferred_effects_dlq` puis `pgmq.delete()` sur la queue d'origine. **pgmq n'a pas de DLQ native**, ce routage est entièrement à écrire
  - [ ] Le message DLQ porte les quatre champs de l'AC : `messageId`, `jobId`, motif (lu depuis `deferred_effect_failures`), action de reprise
  - [ ] « Action de reprise testable » = exécutable et vérifiée par un test, pas décrite en prose. Fournir le moyen de rejouer un message de la DLQ vers la queue principale, et prouver qu'un message ainsi rejoué est traité correctement

- [ ] **T5 — Preuves et portes CI (AC: 1, 2, 3, 4)**
  - [ ] Canari `tests/integration/database-outbox-canary.mjs`, calqué sur `database-command-canary.mjs`. Prouver **par exécution réelle**, jamais par inspection de texte :
    - (a) rollback de la mutation ⇒ aucun message publié
    - (b) rejeu du même `messageId` ⇒ effet appliqué une seule fois, vérifié depuis deux connexions distinctes
    - (c) `read_ct` au-delà du seuil ⇒ message en DLQ avec ses quatre champs
    - (d) rejeu depuis la DLQ ⇒ traitement réussi
    - (e) appel du worker sans header valide ⇒ refus 401
    - (f) lot de `qty + 5` messages avec `qty` fixé ⇒ exactement `qty` consommés, les autres redeviennent visibles après expiration du VT
  - [ ] Brancher le canari dans `scripts/run-database-gates.mjs` après le canari existant, avec le pattern exact de la ligne 47 : `spawnSync(process.execPath, [...], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: ... } })`. **Le spread de `process.env` est indispensable** — sans lui le sous-processus perd tout son environnement. Réutiliser l'isolation en place (ports réservés, `mkdtemp`, `project_id` unique), ne pas créer une seconde pile Supabase
  - [ ] Créer `supabase/tests/database/deferred-effects.test.sql` avec son propre `begin` / `plan(N)` / `finish` / `rollback`, puis **l'ajouter au tableau `sql` de `scripts/run-database-gates.mjs` (lignes 40-44)**. Cette liste est codée en dur : un fichier non ajouté n'est jamais exécuté et la porte reste silencieusement verte. Si l'on étend `rls.test.sql` plutôt, incrémenter son `select plan(4);` ligne 2
  - [ ] Ajouter l'entrée dans `tests/fixtures/ci-gate-mutations.json` **et** la logique correspondante dans `scripts/verify-ci-mutations.mjs` (le script n'exploite pas le JSON dynamiquement ; il dispose de `mutate()`, `temporary()` et `runMustFail()` — choisir la forme adaptée, un canari ne se mute pas forcément par patch de fichier)
  - [ ] **Mettre à jour `tests/integration/ci-mutation.test.mjs` ligne 8** : le `assert.deepEqual` fige la liste ordonnée des 9 portes. Toute entrée ajoutée au JSON casse `ci:integration` immédiatement, avec un message d'erreur qui ne pointe pas vers cette story
  - [ ] Si un nouveau script `ci:*` est créé, l'inscrire **à la fois** dans l'agrégat local `ci:all` **et** comme étape explicite du job approprié de `.github/workflows/ci.yml` (job `database` si la porte démarre Supabase). ⚠️ **La CI GitHub n'appelle jamais `ci:all`** : elle énumère les portes une par une (lignes 29-35, 47, 60-61). Une porte ajoutée seulement à `ci:all` n'est **pas** bloquante en pull request. Vérifier ensuite `tests/integration/ci-contract.test.mjs`
  - [ ] Si la porte outbox s'intègre au `ci:database` existant plutôt que comme nouveau script, aucun ajout au workflow n'est nécessaire — mais le dire explicitement dans les notes de complétion

- [ ] **T6 — Environnement, Cron et exploitation (AC: 2)**
  - [ ] Étendre `src/shared/config/environment.ts` pour le secret du worker et la chaîne de connexion Postgres, en respectant le pattern existant (absence ou incohérence = erreur explicite, aucun défaut implicite). Rappel : ces valeurs sont **optionnelles au build**
  - [ ] Répercuter les nouvelles variables sur les trois cibles qui les attendent, sinon la CI casse : `.env.example`, le bloc `env:` du job `quality` **et** celui du job `database` dans `.github/workflows/ci.yml`. Décider et documenter si `scripts/verify-environment-isolation.mjs` et `tests/unit/environment-isolation.test.mjs` doivent suivre — ils ré-implémentent la validation sans passer par `environment.ts`
  - [ ] SQL de planification `cron.schedule(...)` avec `net.http_post` vers le Route Handler, en-tête `Authorization` lu depuis Vault. `pg_cron` et `pg_net` doivent être activés
  - [ ] Créer `docs/operations/deferred-effects.md` : intervalle retenu, seuil de retries, VT, procédure de reprise depuis la DLQ, consultation de `net._http_response` pour diagnostiquer un worker en erreur, et **ce qui est vérifié en CI contre ce qui ne l'est pas** (le Cron est une ressource de plateforme, non pilotée par `supabase/config.toml`)

## Notes de développement

### Contexte développeur et limites

Le projet est un scaffold d'ingénierie sans aucune fonctionnalité produit. Les six modules `src/modules/*` ne contiennent que des `.gitkeep`. Cette story reste de l'infrastructure : **ne pas créer de table métier, ni d'entité de domaine.** Aucun `Copy`, `UserWork`, `Reading` — `database-gates.test.mjs` l'assert explicitement.

Périmètre exclu : aucune UI, aucun `RewardClaim` réel (story 5.5), aucun worker média (2.4/2.6/2.7). On livre le mécanisme générique et sa preuve, rien de plus.

### Exigences d'architecture

**AD-1 — Frontières et ownership.** Clause sur les effets différés, verbatim :
> « Les effets différés utilisent {messageId, eventType, producer, aggregateId, aggregateVersion, payloadVersion, occurredAt, payload}, livraison au moins une fois, ordre par agrégat et consommateurs idempotents ; aucun ordre global. »

Trois conséquences : la livraison est **at-least-once et jamais exactly-once** — l'idempotence du consommateur est la seule protection contre le double effet ; l'ordre n'est garanti **que par agrégat** ; l'enveloppe est fixe et versionnée. La partie *ownership* d'AD-1 s'applique aussi : un effet différé appartient au module qui l'a produit, ce que porte le champ `producer`.

**AD-12 — Livraison et exploitation**, verbatim :
> « Publier les jobs pgmq avec la transaction métier ; Supabase Cron déclenche des Route Handlers Node Vercel protégés, proches de la base, qui consomment des lots bornés sous maxDuration, visibilité, retries, DLQ et idempotence. »

**AD-3** : un client unique emprunté au Pool porte toute l'unité de travail. Le navigateur n'écrit jamais en base ; RLS en défense en profondeur.

**AD-6** : les mutations déclenchant l'effet différé portent l'enveloppe de commande `{commandId, commandType, actorId, aggregateIds, expectedVersions, payload, occurredAt}` et écrivent leur reçu dans la même transaction. Ne pas confondre `commandId` (commande entrante) et `messageId` (message sortant).

**Convention transverse** : « Une commande = un cas d'usage = une transaction. Tout effet externe part d'une file/outbox durable créée dans cette transaction. »

**Langue** : anglais pour le code et le schéma SQL, français pour l'UI et les noms de tests.

### État actuel et fichiers à préserver

**`tests/integration/database-command-canary.mjs` — le gabarit à imiter.** Seul code Node qui parle à Postgres, et seul fichier du dépôt qui importe `pg`. Il prouve déjà le pattern attendu : `BEGIN`, relecture du reçu avant écriture, effet métier, insertion du reçu, `COMMIT`, `ROLLBACK` explicite dans le `catch`. Idempotence par `command_id text primary key`, vérifiée **entre deux connexions distinctes** (assertion sur des `pg_backend_pid()` différents). L'outbox doit se comporter comme cet `insert into receipts`.

**`scripts/run-database-gates.mjs` — à étendre, pas à dupliquer.** Réserve trois ports, copie `supabase/` dans un `mkdtemp`, patche `config.toml` en mémoire, démarre Supabase, applique les migrations, exécute pgTAP par stdin puis le canari Node, nettoie en `finally`. Le tableau des fichiers pgTAP (lignes 40-44) et l'invocation du canari (ligne 47) sont les deux points d'extension.

Le harnais exclut Studio, Realtime, Storage-API, PostgREST, Kong, GoTrue, Mailpit, postgres-meta, imgproxy, edge-runtime, logflare, vector et supavisor. **Aucune API HTTP Supabase n'est disponible** : c'est pourquoi la logique du worker doit être testable sans passer par HTTP.

**`.github/workflows/ci.yml`** : trois jobs, `quality` / `database` / `browser`, qui énumèrent les portes une par une. `ci:all` n'y apparaît pas.

**`tests/integration/database-gates.test.mjs`** verrouille le harnais par regex (CLI épinglée `2.101.0`, absence de `--project-ref`, présence de `ROLLBACK` et `command_id`). **`tests/integration/ci-mutation.test.mjs` ligne 8** verrouille la liste des portes par `deepEqual` ordonné. Les deux devront suivre.

**`supabase/config.toml`** : minimal. `major_version = 17`, Studio et analytics désactivés. **Aucune section queues, aucun pgmq, aucun pg_cron.**

**`src/shared/config/environment.ts`** : valide `APP_ENV`, `TARGET_FINGERPRINT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Ne fournit **pas** de chaîne de connexion Postgres — `SUPABASE_ANON_KEY` est une clé PostgREST/Auth, pas un `postgresql://`.

**`next.config.ts`** : `typescript.ignoreBuildErrors: true` est **volontaire** (Next 16 ne résout pas la cohabitation TS6/TS7 au build). Le vrai typecheck passe par `npm run typecheck`. Ne pas « corriger » ce réglage.

**À créer de zéro** : extension pgmq, queues, tables d'idempotence et d'échecs, pg_cron, `src/app/api/`, contenu de `src/workers/` et `src/shared/kernel/`, secret du Cron, porte CI dédiée.

### Exigences de tests et définition de fini

Aucun framework de test tiers. `node --test` avec `node:assert/strict`, fichiers `*.test.mjs`. Scripts ESM natifs, imports `node:`, `spawnSync` systématique (jamais de chaîne shell), `process.exitCode = 1` plutôt que `process.exit()`, messages en français, zéro dépendance externe.

Règle héritée de 1.2 : **aucune inspection de texte ne vaut preuve.** Les tests combinent lecture de fichier et exécution réelle avec assertions sur le code de sortie. Chaque porte doit avoir sa preuve de mutation : injecter une régression, vérifier que la porte échoue, restaurer en `finally`.

Fini quand : les quatre AC sont couverts par un test exécutable, `npm run ci:all` passe **et** les portes sont câblées dans le workflow, la mutation associée prouve que la nouvelle porte est bloquante, et `sprint-status.yaml` est à jour.

### Enseignements de la Story 1.2

Huit constats de revue corrigés. Ceux qui menacent cette story :

1. **Une porte non câblée n'est pas bloquante** — déjà tombé une fois, et le piège est plus subtil qu'il n'y paraît puisque la CI n'utilise pas `ci:all`.
2. **Une mutation de test doit réellement modifier le contenu** — le harnais compare avant/après pour rejeter les transformations inopérantes.
3. **L'atomicité se prouve sur un état persistant observable depuis plusieurs connexions**, pas en mémoire du process.
4. **Isolation obligatoire** : ports, `project_id` et répertoire temporaire uniques.

Deux incidents d'environnement, sous Docker Desktop Windows :
- Le **montage de volume échoue** avec les chemins du dépôt, d'où l'injection du SQL **par stdin** via `docker exec -i ... psql`. Réutiliser ce pattern, ne pas retenter un montage.
- Un **conteneur pgTAP orphelin** a bloqué l'environnement, débloquable seulement par un redémarrage de Docker Desktop qui aurait interrompu 11 conteneurs d'autres projets. L'agent a **demandé l'autorisation avant d'agir**. Reproduire ce comportement : aucune action destructive sur l'environnement partagé sans accord explicite.

### Intelligence Git

```
928c5f6 chore: installer les skills BMAD pour Claude Code
96a0834 ci: bloquer les regressions du MVP
db17b57 feat: initialiser le socle My BookShelf
```

Convention : Conventional Commits en **français**, sujet en minuscule sans point final (`feat:`, `ci:`, `chore:`). Corps optionnel expliquant le pourquoi. Trailer `Co-Authored-By` quand un agent a contribué.

Chaque commit de story met aussi à jour `_bmad-output/implementation-artifacts/sprint-status.yaml`.

Écart relevé sur `96a0834` : `src/app/layout.tsx` modifié sans figurer dans la « Liste des fichiers » de la story. Tenir la liste exhaustive cette fois.

### Informations techniques actuelles

**Stack figée** : Node 24.18.0, Next.js 16.2.12, React 19.2.8, TypeScript 7.0.2 strict, PostgreSQL 17, `pg` 8.16.3 (le lockfile fait autorité), Supabase CLI épinglée 2.101.0.

**API pgmq**, signatures vérifiées sur la documentation officielle :

```sql
pgmq.create(queue_name text) RETURNS void
pgmq.send(queue_name text, msg jsonb) RETURNS SETOF bigint
pgmq.send(queue_name text, msg jsonb, delay integer) RETURNS SETOF bigint
pgmq.read(queue_name text, vt integer, qty integer) RETURNS SETOF pgmq.message_record
pgmq.set_vt(queue_name text, msg_id bigint, vt integer) RETURNS SETOF pgmq.message_record
pgmq.delete(queue_name text, msg_id bigint) RETURNS boolean
pgmq.archive(queue_name text, msg_id bigint) RETURNS boolean
pgmq.metrics(queue_name text) RETURNS pgmq.metrics_result
```

`pgmq.message_record` expose **`read_ct`**, compteur de lectures incrémenté à chaque `read` : c'est lui qui borne les retries. `pgmq.pop()` existe mais fait un read+delete atomique en at-most-once — **ne pas l'utiliser**, il perd les messages en cas d'échec.

pgmq étant du SQL Postgres standard, `pgmq.send()` participe naturellement à la transaction métier. C'est ce qui élimine le problème classique de double écriture base + broker externe : aucun 2PC nécessaire.

`maxDuration` sur Vercel : 300 s par défaut, jusqu'à 800 s selon le plan. Un worker de queue n'a aucune raison d'en approcher.

Supabase Cron s'appuie sur `pg_cron` (planification) et `pg_net` (HTTP asynchrone). Les réponses sont consultables dans `net._http_response`.

**Trois points à vérifier en début d'implémentation plutôt qu'à supposer :**
1. La version de pgmq réellement disponible — `select extversion from pg_extension where extname = 'pgmq';`
2. La forme canonique de lecture d'un secret Vault (table `vault.decrypted_secrets` contre fonction dédiée) varie selon la version de l'extension. À tester avant de l'inscrire dans le SQL du Cron.
3. Les limites de Supabase Queues (taille de message, débit) ne sont pas publiées. Ne pas les deviner.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md#Epic-1-Story-1.3`]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-1`] — enveloppe, at-least-once, ordre par agrégat, ownership
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-12`] — pgmq, Cron, Route Handlers bornés, DLQ
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-3`] — plateforme de données, Pool, RLS
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-6`] — enveloppe de commande, reçu transactionnel
- [Source : `_bmad-output/specs/spec-my-bookshelf/SPEC.md#CAP-12`] — NFR-1, NFR-2, NFR-8
- [Source : `_bmad-output/implementation-artifacts/1-2-bloquer-une-livraison-qui-viole-les-garanties-du-mvp.md`] — patterns CI, canari, incidents Docker
- [pgmq — référence des fonctions SQL](https://pgmq.github.io/pgmq/api/sql/functions/)
- [Supabase Queues](https://supabase.com/docs/guides/queues) · [Supabase Cron](https://supabase.com/docs/guides/cron) · [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Vercel — durée des fonctions](https://vercel.com/docs/functions/configuring-functions/duration)
- [Pattern transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)

## Enregistrement de l'agent de développement

### Modèle utilisé

_À renseigner par l'agent de développement._

### Références du journal de débogage

### Plan d'implémentation

### Notes de complétion

### Liste des fichiers

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-04 | Story créée et contextualisée, statut `ready-for-dev`. |
