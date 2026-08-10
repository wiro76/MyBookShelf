---
baseline_commit: 928c5f67a1759e29649d48988288c8a5e5e71cd9
---

# Story 1.3 : Exécuter les traitements différés sans perte ni doublon

Status: done

## Story

En tant que Zan,
je veux que les traitements en arrière-plan soient reprenables,
afin qu'une panne ne perde ni ne double une action confirmée.

**Traçabilité :** CAP-12 ; NFR-1, NFR-2, NFR-8 ; AD-1, AD-3, AD-6, AD-12.

Cette story ne livre aucune fonctionnalité visible. Elle pose l'infrastructure d'effets différés dont dépendent 2.5 (import de couverture), 2.7/2.8 (publication/révocation et GC des médias), 5.3 et 5.5 (fin de lecture et crédit de récompense). Si elle est bâclée, ces stories réinventeront chacune leur mécanique de reprise.

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

- [x] **T1 — Activer pgmq et poser le contrat de publication transactionnelle (AC: 1)**
  - [x] Migration `supabase/migrations/<14 chiffres>_deferred_effects_expand.sql` (format identique à `20260804000100_ci_canary_expand.sql`) : `create extension if not exists pgmq;`
  - [x] Créer les deux queues via `pgmq.create()`. Noms en anglais, sans préempter un nom de domaine métier — `database-gates.test.mjs` interdit explicitement `Copy`, `UserWork`, `Reading`
  - [x] Écrire une fonction SQL `publish_deferred_effect(...)` qui valide l'enveloppe AD-1 **complète** puis appelle `pgmq.send()`. Enveloppe obligatoire et versionnée : `messageId`, `eventType`, `producer`, `aggregateId`, `aggregateVersion`, `payloadVersion`, `occurredAt`, `payload`. Lever une erreur sur toute enveloppe incomplète — un message sans `payloadVersion` est un bug silencieux à la consommation
  - [x] Table d'idempotence de consommation : contrainte unique sur `messageId` + horodatage de traitement. C'est elle qui garantit l'AC 3
  - [x] Table `deferred_effect_failures(message_id, read_ct, error_code, error_message, occurred_at)` : sans elle, le motif d'échec est **impossible** à connaître au moment du routage DLQ, puisque la tentative précédente s'est terminée par un `ROLLBACK` qui a tout effacé. Écrite dans une transaction séparée, après le rollback métier
  - [x] RLS : ni la table d'idempotence, ni `pgmq`, ni la table d'échecs ne sont accessibles au navigateur. Accès `service_role` uniquement, prouvé par pgTAP
  - [x] Création neuve : une seule migration `expand` suffit. Forward-only, jamais de downgrade dans `supabase/migrations/`

- [x] **T2 — Worker et Route Handler borné (AC: 2)**
  - [x] Écrire la logique dans `src/workers/deferred-effects/`, sous forme de **fonction pure importable depuis un test Node**, recevant sa connexion en paramètre. C'est la condition pour que l'AC 2 soit prouvable
  - [x] Créer `src/app/api/deferred-effects/process/route.ts` — le dossier `src/app/api/` n'existe pas encore. Il authentifie, génère le `jobId`, délègue au worker, rien d'autre
  - [x] `export const maxDuration = 60`
  - [x] Protection : comparer `Authorization: Bearer <secret>` à une variable d'environnement dédiée. 401 sans détail en cas d'échec. Ce secret n'est **pas** `SUPABASE_ANON_KEY`
  - [x] Wrapper Pool/transaction réutilisable dans `src/shared/kernel/` (dossier vide aujourd'hui). Ne pas dupliquer le code de connexion dans le Route Handler
  - [x] Lot borné : `pgmq.read(queue, vt, qty)` avec `qty` plafonné entre 10 et 20. VT nettement au-dessus de la durée de traitement d'un message, nettement sous `maxDuration`
  - [x] Arrêt propre : suivre le temps écoulé, sortir de la boucle avec ≈10 s de marge avant `maxDuration`. Les messages non traités redeviennent visibles à l'expiration du VT — ne jamais risquer une coupure en plein `delete`
  - [x] Verrou de concurrence selon la décision tranchée ci-dessus

- [x] **T3 — Idempotence et retries bornés (AC: 3)**
  - [x] Ordre non négociable : insérer le `messageId` dans la table d'idempotence **dans la même transaction que l'effet métier** → `COMMIT` → **puis seulement** `pgmq.delete()`. Supprimer avant le commit perd le message
  - [x] `messageId` déjà présent → succès sans réappliquer l'effet, puis suppression du message
  - [x] Borner par `read_ct` selon le seuil tranché. Échec sous le seuil : ne rien supprimer, laisser le VT expirer ou appeler `pgmq.set_vt()` pour un backoff explicite, et journaliser l'erreur dans `deferred_effect_failures`

- [x] **T4 — DLQ et reprise testable (AC: 4)**
  - [x] `read_ct > 5` → `pgmq.send()` vers `deferred_effects_dlq` puis `pgmq.delete()` sur la queue d'origine. **pgmq n'a pas de DLQ native**, ce routage est entièrement à écrire
  - [x] Le message DLQ porte les quatre champs de l'AC : `messageId`, `jobId`, motif (lu depuis `deferred_effect_failures`), action de reprise
  - [x] « Action de reprise testable » = exécutable et vérifiée par un test, pas décrite en prose. Fournir le moyen de rejouer un message de la DLQ vers la queue principale, et prouver qu'un message ainsi rejoué est traité correctement

- [x] **T5 — Preuves et portes CI (AC: 1, 2, 3, 4)**
  - [x] Canari `tests/integration/database-outbox-canary.mjs`, calqué sur `database-command-canary.mjs`. Prouver **par exécution réelle**, jamais par inspection de texte :
    - (a) rollback de la mutation ⇒ aucun message publié
    - (b) rejeu du même `messageId` ⇒ effet appliqué une seule fois, vérifié depuis deux connexions distinctes
    - (c) `read_ct` au-delà du seuil ⇒ message en DLQ avec ses quatre champs
    - (d) rejeu depuis la DLQ ⇒ traitement réussi
    - (e) appel du worker sans header valide ⇒ refus 401
    - (f) lot de `qty + 5` messages avec `qty` fixé ⇒ exactement `qty` consommés, les autres redeviennent visibles après expiration du VT
  - [x] Brancher le canari dans `scripts/run-database-gates.mjs` après le canari existant, avec le pattern exact de la ligne 47 : `spawnSync(process.execPath, [...], { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: ... } })`. **Le spread de `process.env` est indispensable** — sans lui le sous-processus perd tout son environnement. Réutiliser l'isolation en place (ports réservés, `mkdtemp`, `project_id` unique), ne pas créer une seconde pile Supabase
  - [x] Créer `supabase/tests/database/deferred-effects.test.sql` avec son propre `begin` / `plan(N)` / `finish` / `rollback`, puis **l'ajouter au tableau `sql` de `scripts/run-database-gates.mjs` (lignes 40-44)**. Cette liste est codée en dur : un fichier non ajouté n'est jamais exécuté et la porte reste silencieusement verte. Si l'on étend `rls.test.sql` plutôt, incrémenter son `select plan(4);` ligne 2
  - [x] Ajouter l'entrée dans `tests/fixtures/ci-gate-mutations.json` **et** la logique correspondante dans `scripts/verify-ci-mutations.mjs` (le script n'exploite pas le JSON dynamiquement ; il dispose de `mutate()`, `temporary()` et `runMustFail()` — choisir la forme adaptée, un canari ne se mute pas forcément par patch de fichier)
  - [x] **Mettre à jour `tests/integration/ci-mutation.test.mjs` ligne 8** : le `assert.deepEqual` fige la liste ordonnée des 9 portes. Toute entrée ajoutée au JSON casse `ci:integration` immédiatement, avec un message d'erreur qui ne pointe pas vers cette story
  - [x] Si un nouveau script `ci:*` est créé, l'inscrire **à la fois** dans l'agrégat local `ci:all` **et** comme étape explicite du job approprié de `.github/workflows/ci.yml` (job `database` si la porte démarre Supabase). ⚠️ **La CI GitHub n'appelle jamais `ci:all`** : elle énumère les portes une par une (lignes 29-35, 47, 60-61). Une porte ajoutée seulement à `ci:all` n'est **pas** bloquante en pull request. Vérifier ensuite `tests/integration/ci-contract.test.mjs`
  - [x] Si la porte outbox s'intègre au `ci:database` existant plutôt que comme nouveau script, aucun ajout au workflow n'est nécessaire — mais le dire explicitement dans les notes de complétion

- [ ] **T6 — Environnement, Cron et exploitation (AC: 2)** — partiellement livrée, voir l'état réel ci-dessous
  - [x] Étendre `src/shared/config/environment.ts` pour le secret du worker et la chaîne de connexion Postgres, en respectant le pattern existant (absence ou incohérence = erreur explicite, aucun défaut implicite). Rappel : ces valeurs sont **optionnelles au build**
  - [x] Répercuter les nouvelles variables sur `.env.example`
  - [ ] Répercuter les nouvelles variables sur le bloc `env:` du job `quality` **et** celui du job `database` dans `.github/workflows/ci.yml`
  - [ ] Décider et documenter si `scripts/verify-environment-isolation.mjs` et `tests/unit/environment-isolation.test.mjs` doivent suivre — ils ré-implémentent la validation sans passer par `environment.ts`
  - [x] SQL de planification `cron.schedule(...)` avec `net.http_post` vers le Route Handler, en-tête `Authorization` lu depuis Vault. `pg_cron` et `pg_net` doivent être activés
  - [x] Créer `docs/operations/deferred-effects.md` : intervalle retenu, seuil de retries, VT, procédure de reprise depuis la DLQ, consultation de `net._http_response` pour diagnostiquer un worker en erreur, et **ce qui est vérifié en CI contre ce qui ne l'est pas** (le Cron est une ressource de plateforme, non pilotée par `supabase/config.toml`)

  **État réel de T6.** `.github/workflows/ci.yml` n'a jamais été modifié : ni `DATABASE_URL` ni `DEFERRED_EFFECTS_WORKER_SECRET` n'apparaissent dans les blocs `env:` des jobs `quality` et `database`. La CI n'est pas cassée pour autant, car le harnais `scripts/run-database-gates.mjs` injecte lui-même les deux variables dans l'environnement du canari outbox (`TEST_DATABASE_URL`, `DATABASE_URL`, `DEFERRED_EFFECTS_WORKER_SECRET`), avec un secret jetable par exécution — le workflow n'a donc rien à fournir aujourd'hui. La répercussion dans le workflow, ainsi que la décision sur `verify-environment-isolation.mjs` / `environment-isolation.test.mjs` (qui ré-implémentent la validation hors de `environment.ts`), restent à faire et relèvent d'un arbitrage produit/infra : elles ne sont pas prises ici.

### Constats de revue

Revue adversariale en trois couches sur `9c924ea` (2026-08-04). Corrigés dans `559b3d5` : publication impossible par `service_role`, arrêt de pile silencieux sous Windows, garde d'isolation inopérante sans `APP_ENV`, échec DLQ avortant le lot, verrou consultatif fuité, deux sous-tâches T6 faussement cochées.

Restent ouverts.

**Décisions attendues**

- [x] [Review][Decision] Ordre par agrégat implémenté — le lot est trié par `msg_id` numérique et tout message dont un prédécesseur du même `aggregateId` n'a pas abouti est écarté sans être consommé ni pénalisé (compteur `skippedForOrder`). Prouvé unitairement et par la preuve (g) du canari. Limites documentées dans le code : l'ordre repose sur `msg_id`, alloué à l'INSERT et non au COMMIT, donc deux producteurs concurrents peuvent encore inverser ; `aggregateVersion` n'est toujours pas relu ; `read_ct` monte malgré tout sur les messages écartés.
- [x] [Review][Decision] Rétention livrée — `deferred.purge_processed_messages(interval)` ne supprime que les lignes anciennes ET absentes des quatre tables pgmq réelles (queues et archives), ce qui rend la purge incapable de réintroduire un double traitement. Index dédié, `security definer`, `grant` au seul `service_role`, assertions pgTAP contre un vrai pgmq. La documentation avertit qu'une purge SQL brute hors de cette fonction casse la garantie.
- [x] [Review][Decision] `src/shared/kernel/transaction.ts` supprimé (aucun appelant ; le worker doit rester importable depuis un `.mjs`) — anciennement code mort — aucun appelant ; le worker réécrit `BEGIN`/`COMMIT`/`ROLLBACK` quatre fois (`:277`, `:309`, `:365`, `:573`), ce que T2 interdisait. La duplication vient de la contrainte d'importabilité depuis un `.mjs` (aucun import relatif). Soit supprimer le wrapper, soit lever la contrainte.
- [x] [Review][Decision] VT ramené à 30 s, ordre `VT < deadline < maxDuration` documenté — anciennement `VISIBILITY_TIMEOUT_SECONDS = 60` égale `maxDuration = 60`, alors que T2 exigeait « nettement sous ». Un handler dépassant 10 s peut voir son message redevenir visible pendant son exécution.
- [x] [Review][Decision] Écart T6 sur `.github/workflows/ci.yml` refermé par vérification, sans modification : `run-database-gates.mjs` injecte lui-même `DATABASE_URL` et un secret jetable par exécution au seul processus qui les consomme, et aucun script du job `quality` ne lit ces variables — `ci:static` passe sans elles. Les ajouter au workflow aurait été redondant et aurait risqué d'écraser l'injection correcte.
- [x] [Review][Decision] Secret en clair dans `pg_net` : limitation établie, non réparable, documentée. Le constat d'origine était partiellement faux et a été rectifié par inspection d'une instance réelle (`pg_net 0.20.0`, Postgres 17.6.1.106) : le secret transite bien en clair par `net.http_request_queue`, lisible par `anon` et `authenticated` — mais il n'atteint **jamais** `net._http_response` (qui ne porte que les en-têtes de réponse), et il n'est **pas** capturé par les sauvegardes logiques (pg_net n'appelle pas `pg_extension_config_dump` ; un `pg_dump --schema=net` avec un secret en file produit 670 octets sans aucun `COPY`). Découverte décisive : la mitigation évidente — révoquer l'accès au schéma `net` — **est impossible**, les `grant … to PUBLIC` venant de `supabase_admin` dont `postgres` n'est pas membre ; `revoke` répond `WARNING: no privileges could be revoked`. Mitigations réelles documentées dans `docs/operations/deferred-effects.md` (ne jamais exposer `net` via PostgREST, rotation du secret, surveillance). Alternative jeton HMAC à durée de vie courte décrite avec son coût, délibérément non implémentée : le secret ne permet que de déclencher un worker idempotent et sérialisé.

**Correctifs sans ambiguïté, non appliqués**

- [x] [Review][Patch] `deferred.publish_effect` ne valide que la présence des clés — `'{"payloadVersion": null}' ? 'payloadVersion'` vaut vrai. Une enveloppe à valeur nulle est publiée puis rejetée à la consommation, exactement le bug silencieux que T1 voulait interdire [`supabase/migrations/20260805000100_deferred_effects_expand.sql:44`]
- [x] [Review][Patch] Migration non rejouable — `create schema deferred` et les `pgmq.create` sont sans garde d'existence ; un échec partiel ne se répare pas par relance [`supabase/migrations/20260805000100_deferred_effects_expand.sql:3`]
- [x] [Review][Patch] Options du worker non validées — `shutdownMarginMs >= maxDurationMs` produit un `stoppedForTime` immédiat à chaque tick, `batchSize <= 0` un no-op silencieux, `retryBackoffSeconds` négatif une boucle chaude qui brûle les 5 tentatives en millisecondes [`src/workers/deferred-effects/index.ts:389`]
- [x] [Review][Patch] Un seul lot par exécution, sans indicateur de reste — débit plafonné à `batchSize` par tick, et une file saturée est indiscernable d'une file vide [`src/workers/deferred-effects/index.ts:437`]
- [x] [Review][Patch] Rejeu DLQ bloqué en tête de file — une enveloppe illisible est comptée `discarded` puis laissée en place, sans `set_vt` ni suppression ; `batchSize` entrées irrécupérables rendent tout rejeu impossible [`src/workers/deferred-effects/index.ts:564`]
- [x] [Review][Patch] `describeError` peut lever hors de tout `try` sur une erreur exotique, tuant l'exécution au lieu de la journaliser [`src/workers/deferred-effects/index.ts:307`]
- [x] [Review][Patch] `occurredAt` accepté comme toute chaîne non vide, sans `Date.parse` [`src/workers/deferred-effects/index.ts:228`]
- [x] [Review][Patch] `quote()` n'échappe que les espaces — un `&`, `^` ou `%` dans le chemin `%TEMP%` casse la commande sous `cmd.exe` [`scripts/run-database-gates.mjs:35`]
- [x] [Review][Patch] Aucun test unitaire sur les fonctions pures (`parseDeferredEffectEnvelope`, `createJobId`, `isAuthorized`) — leur seule couverture est le canari, qui exige Docker

**Écarté**

- [x] [Review][Dismiss] « La porte de mutation ne prouve rien » — confusion entre `ci-mutation.test.mjs`, déclaratif, et `scripts/verify-ci-mutations.mjs:52` qui mute réellement le worker et relance `ci:database`. La coupure de courant du 4 août l'a prouvé en laissant cette mutation dans le fichier.

## Notes de développement

### Contexte développeur et limites

Le projet est un scaffold d'ingénierie sans aucune fonctionnalité produit. Les six modules `src/modules/*` ne contiennent que des `.gitkeep`. Cette story reste de l'infrastructure : **ne pas créer de table métier, ni d'entité de domaine.** Aucun `Copy`, `UserWork`, `Reading` — `database-gates.test.mjs` l'assert explicitement.

Périmètre exclu : aucune UI, aucun `RewardClaim` réel (story 5.5), aucun worker média (2.5/2.7/2.8). On livre le mécanisme générique et sa preuve, rien de plus.

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

Claude Opus 5 (`claude-opus-5`), en supervision de quatre sous-agents : lot SQL, lot TypeScript, lot preuves, lot exploitation.

### Références du journal de débogage

**Blocage 1 — `ci:database` inexécutable sous Windows.** `scripts/run-database-gates.mjs` appelait `spawnSync("npx", …)` sans `shell`. Sous Windows, `npx` est un `.cmd` : Node répond `ENOENT` sur `"npx"` et `EINVAL` sur `"npx.cmd"` depuis la mitigation CVE-2024-27980. La porte échouait avant toute migration. Diagnostic confirmé par exécution isolée (`shell: true` → sortie `2.101.0`). Corrigé par `shell: process.platform === "win32"`, avec quotage du `workdir` s'il contient un espace. Le spawn direct est préservé sur Linux, donc la CI est inchangée. Défaut préexistant, hérité de la story 1.2.

**Blocage 2 — `ci:mutations` inexécutable sous Windows.** Même cause sur `spawnSync("npm", …)` dans `scripts/verify-ci-mutations.mjs`. Le shell n'est activé que pour `npm`, jamais pour `process.execPath` dont le chemin contient des espaces et ne survivrait pas à `cmd.exe`.

**Blocage 3 — mutation `database` inopérante sous Windows.** Le remplacement multi-lignes sur `rls.test.sql` utilisait `\n` littéral alors que la copie de travail est en CRLF : le harnais refusait la transformation comme inopérante. Passé en `\r?\n(\s*)` avec restitution de l'indentation.

**Point ouvert — import TypeScript depuis un canari `.mjs`.** La CI tourne sous Node 24.18.0 (effacement de types natif), la machine locale sous Node 22.15.1 (nécessite `--experimental-strip-types`). Le canari tente l'import direct et, sur `ERR_UNKNOWN_FILE_EXTENSION`, se relance une seule fois en sous-processus avec le drapeau, protégé par une sentinelle contre la boucle. `module.registerHooks()` fournit la résolution de l'alias `@/*` et la lecture du JSON de configuration. **Seul le chemin « relance avec drapeau » a été exercé localement** ; le chemin « import direct » ne sera emprunté qu'en CI.

### Plan d'implémentation

Contrat d'interface figé en amont par le superviseur (schéma `deferred`, noms de queues, signature de `publish_effect`, tables, seuil, lot, VT, clé de verrou, variables d'environnement), puis quatre lots :

1. **SQL** — migration, queues, fonction de publication validante, tables d'idempotence et d'échecs, RLS sans policy, test pgTAP.
2. **TypeScript** — wrapper Pool/transaction, worker en fonction pure injectable, Route Handler adaptateur, validation d'environnement en deux niveaux.
3. **Preuves** — canari outbox à six preuves, branchement dans le harnais, porte de mutation, mise à jour des verrous de liste.
4. **Exploitation** — SQL de Cron non appliqué automatiquement, documentation opérationnelle.

### Notes de complétion

Les quatre AC sont couverts par exécution réelle contre une base Supabase éphémère. Le canari `database-outbox-canary.mjs` prouve : (a) rollback sans publication, (b) rejeu idempotent vérifié depuis deux connexions aux `pg_backend_pid()` distincts, (c) routage DLQ au-delà du seuil avec les quatre champs contrôlés un à un, (d) reprise depuis la DLQ, (e) refus 401 du Route Handler sur les quatre cas d'en-tête, (f) lot borné et revisibilité après expiration du VT.

La porte de mutation casse réellement l'idempotence du worker (`on conflict do nothing` → `do update`) et fait échouer `ci:database` — c'est une régression du code de production, pas un patch de test.

**Aucun nouveau script `ci:*` n'a été créé** : la porte outbox s'exécute à l'intérieur de `ci:database`, déjà énumérée comme étape du job `database` dans le workflow et présente dans `ci:all`. Rien à câbler en plus.

**Non prouvé, assumé :** le verrou consultatif de concurrence (`skipped: true`) n'est pas couvert par les six preuves ; l'arrêt propre avant `maxDuration` n'est pas exercé sous charge ; le Cron Supabase (`pg_cron`, `pg_net`, Vault) n'est pas testable depuis le harnais et reste une ressource de plateforme ; la preuve (e) invoque la fonction `POST` exportée sans transport HTTP réel, aucune API Supabase n'étant disponible dans le harnais ; la preuve (f) porte une dépendance temporelle au VT de 4 s qui échouerait bruyamment sur une machine très lente.

**À vérifier avant mise en production :** la forme canonique de lecture du secret Vault dans `supabase/cron/deferred-effects.sql`, signalée par un avertissement dans le fichier et dans la documentation d'exploitation.

### Liste des fichiers

Fichiers créés :

- `tests/unit/deferred-effects.test.mjs`
- `supabase/migrations/20260805000100_deferred_effects_expand.sql`
- `supabase/tests/database/deferred-effects.test.sql`
- `supabase/cron/deferred-effects.sql`
- `src/shared/kernel/index.ts`
- `src/shared/kernel/pool.ts`
- `src/workers/deferred-effects/index.ts`
- `src/app/api/deferred-effects/process/route.ts`
- `tests/integration/database-outbox-canary.mjs`
- `docs/operations/deferred-effects.md`

Fichiers modifiés :

- `.env.example`
- `scripts/run-database-gates.mjs`
- `scripts/verify-ci-mutations.mjs`
- `src/shared/config/environment.ts`
- `tests/fixtures/ci-gate-mutations.json`
- `tests/integration/ci-mutation.test.mjs`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-04 | Story créée et contextualisée, statut `ready-for-dev`. |
| 2026-08-04 | Outbox implémenté : migration pgmq, worker, Route Handler, canari à six preuves, porte CI de mutation. |
| 2026-08-05 | Revue adversariale en trois couches. Six défauts corrigés, dont `publish_effect` inutilisable par `service_role` et la garde d'isolation inopérante sans `APP_ENV`. |
| 2026-08-05 | Durcissement : validation d'enveloppe par type côté SQL, options du worker validées, archivage des entrées DLQ illisibles, 65 tests unitaires, VT ramené à 30 s, `transaction.ts` supprimé. |
| 2026-08-05 | Ordre par agrégat (AD-1) implémenté et prouvé, purge d'idempotence sûre livrée, limitation `pg_net` établie et documentée. Statut `done`. |
