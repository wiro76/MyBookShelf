# Exploitation des effets différés (story 1.3)

Infrastructure générique d'outbox transactionnel (AD-1, AD-12) : aucune fonctionnalité produit ne l'utilise encore. Les stories 2.4, 2.6/2.7, 5.3 et 5.5 y brancheront leurs effets métier.

## Schéma de bout en bout

1. **Mutation** : un cas d'usage écrit son effet métier et publie l'enveloppe AD-1 dans la **même transaction**, via `select deferred.publish_effect('deferred_effects', <enveloppe jsonb>)` (`supabase/migrations/20260805000100_deferred_effects_expand.sql`). La fonction vérifie, pour chacune des huit clés (`messageId`, `eventType`, `producer`, `aggregateId`, `aggregateVersion`, `payloadVersion`, `occurredAt`, `payload`), **le TYPE et la validité de la valeur** (UUID, chaîne non vide, entier, objet JSON), pas seulement sa présence — la présence seule laissait passer `{"payloadVersion": null}` (`jsonb ? 'payloadVersion'` vaut vrai même pour une valeur `null`). Toute enveloppe invalide fait échouer `publish_effect` avec une erreur Postgres **`22023`** détaillant chaque champ fautif (`raise exception ... using errcode = '22023'`), directement à la publication. Un `ROLLBACK` de la mutation annule aussi la publication, gratuitement, puisque `pgmq.send()` est du SQL standard.
   **Changement de contrat pour les futurs producteurs** (stories 2.4, 2.6, 5.3, 5.5) : le code applicatif qui appellera `deferred.publish_effect` doit s'attendre à une erreur `22023` — et donc au `ROLLBACK` de sa transaction — si un champ de l'enveloppe est absent, du mauvais type ou `null`, et pas seulement si une clé manque.
   `deferred.publish_effect` est déclarée `security definer` avec `set search_path = ''` : `service_role` n'a et ne doit avoir aucun droit direct sur le schéma `pgmq`, sinon il pourrait publier en contournant cette validation d'enveloppe.
2. **Supabase Cron** déclenche `net.http_post` vers le Route Handler toutes les minutes (`supabase/cron/deferred-effects.sql`, non appliqué automatiquement — voir plus bas).
3. **Route Handler** : `POST /api/deferred-effects/process` (`src/app/api/deferred-effects/process/route.ts`). Il vérifie `Authorization: Bearer <DEFERRED_EFFECTS_WORKER_SECRET>` en temps constant (401 sans détail si absent ou invalide), génère un `jobId` UUIDv7, délègue au worker et renvoie son résultat en JSON. Aucune règle métier n'y vit (AD-2).
4. **Worker** (`src/workers/deferred-effects/index.ts`, fonction `processDeferredEffects`) : valide d'abord ses options (voir « Validation des options du worker » ci-dessous), prend le verrou consultatif, lit un lot borné avec `pgmq.read`, traite chaque message dans sa propre transaction (idempotence + effet métier + `COMMIT`, puis seulement `pgmq.delete`), s'arrête proprement avant `maxDuration`, libère le verrou en `finally`.
5. **DLQ** : au-delà du seuil de retries, le message est routé vers `deferred_effects_dlq` avec une enveloppe enrichie (`jobId`, `failureReason`, `replayAction`), sans tentative de traitement.

## Valeurs opérationnelles réelles

Toutes lues dans `src/workers/deferred-effects/index.ts` (ce sont les constantes du contrat, pas des valeurs par défaut inventées) :

| Paramètre | Valeur | Constante |
|---|---|---|
| Seuil de retries avant DLQ | 5 (`read_ct > 5` ⇒ DLQ sans traitement, soit exactement 5 tentatives réelles) | `RETRY_THRESHOLD` |
| Taille de lot lu par exécution | 10 | `BATCH_SIZE` |
| Timeout de visibilité pgmq (VT) | **30 s** | `VISIBILITY_TIMEOUT_SECONDS` |
| Clé du verrou consultatif (`pg_try_advisory_lock` / `pg_advisory_unlock`) | `4210031003` | `ADVISORY_LOCK_KEY` |
| `maxDuration` du worker (vu côté logique de boucle) | 60 000 ms | `MAX_DURATION_MS` |
| Marge d'arrêt propre avant `maxDuration` | 10 000 ms | `SHUTDOWN_MARGIN_MS` |
| Taille de lot rejoué par défaut depuis la DLQ | 10 | `REPLAY_BATCH_SIZE` |
| Mise à l'écart d'une entrée DLQ illisible dont l'archivage a échoué | 3 600 s (1 h) | `QUARANTINE_VISIBILITY_SECONDS` |

Le Route Handler (`src/app/api/deferred-effects/process/route.ts`) déclare `export const maxDuration = 60;` (secondes) — cohérent avec `MAX_DURATION_MS`. Les noms de queues sont `deferred_effects` et `deferred_effects_dlq` (`DEFERRED_EFFECTS_QUEUE`, `DEFERRED_EFFECTS_DEAD_LETTER_QUEUE`), le schéma SQL est `deferred` (`DEFERRED_EFFECTS_SCHEMA`).

### Ordre qui fait contrat : VT < deadline < maxDuration

Trois valeurs réelles, dans cet ordre strict, calculées à chaque exécution comme `deadline = startedAt + MAX_DURATION_MS - SHUTDOWN_MARGIN_MS` :

```
VT (30 s)  <  deadline (50 s)  <  maxDuration (60 s)
```

- **VT — 30 s** (`VISIBILITY_TIMEOUT_SECONDS`) : un message lu puis non traité (crash, arrêt brutal) redevient visible pour une prochaine lecture 30 s après sa lecture — donc AVANT la fin de l'exécution courante (deadline à 50 s), et bien avant le tick suivant du cron (60 s).
- **deadline — 50 s** (`MAX_DURATION_MS - SHUTDOWN_MARGIN_MS` = 60 000 − 10 000 ms) : passé ce cap, la boucle cesse de prendre de nouveaux messages et rend son résultat proprement (`stoppedForTime: true`).
- **maxDuration — 60 s** (`MAX_DURATION_MS`, égal au `maxDuration` déclaré par le Route Handler) : au-delà, la plateforme (Vercel) tue le processus sans préavis, sans possibilité de rendre un résultat.

Avant le correctif, le VT valait 60 s — exactement `maxDuration`. Un message lu puis abandonné par un arrêt brutal restait invisible aussi longtemps que la fenêtre entière, et le VT expirait au moment même où la plateforme tuait le worker : aucune marge. 30 s reste très au-dessus d'un traitement nominal (quelques millisecondes) tout en garantissant la revisibilité avant l'expiration de la fenêtre HTTP.

La concurrence est sérialisée **globalement** par le verrou consultatif : si une exécution est déjà en cours, la suivante répond `200 { skipped: true, reason: "advisory-lock-not-acquired" }` et ressort immédiatement sans erreur.

### Validation des options du worker

`processDeferredEffects` et `replayDeadLetteredEffects` valident leurs options AVANT tout emprunt de connexion (donc avant même de tenter le verrou consultatif). Une valeur incohérente lève `DeferredEffectsOptionsError` (propriété `code: "INVALID_WORKER_OPTIONS"`), jamais un défaut implicite ni une dégradation silencieuse. Cas rejetés notamment : `queue` et `deadLetterQueue` identiques, `batchSize <= 0`, `retryThreshold < 1`, `visibilityTimeoutSeconds < 0`, `shutdownMarginMs >= maxDurationMs` (sinon la deadline est déjà dépassée au démarrage et chaque exécution rend un `stoppedForTime: true` immédiat, indéfiniment), `retryBackoffSeconds` négatif. Pertinent pour tout appel du worker hors du Route Handler par défaut (script de reprise, test, changement des valeurs par défaut) : une erreur à l'appel signale une mauvaise configuration, pas un incident de production.

### Forme du résultat

**`processDeferredEffects` → `ProcessDeferredEffectsResult`** :

| Champ | Signification | Diagnostic si non nul / inattendu |
|---|---|---|
| `jobId` | Identifiant de corrélation de l'exécution (UUIDv7). | — |
| `skipped` | `true` : verrou consultatif non obtenu, aucun lot lu. | Persistant ⇒ voir « Verrou consultatif resté détenu » plus bas. |
| `reason` | `"advisory-lock-not-acquired"` quand `skipped`, sinon `null`. | — |
| `read` | Messages lus ce tick (0 à `batchSize`). | — |
| `processed` | Effets appliqués avec succès. | — |
| `duplicated` | Messages déjà marqués traités (rejeu absorbé par l'idempotence). | Élevé en continu ⇒ le VT ou le rythme du cron sont peut-être trop courts pour le temps de traitement réel. |
| `deadLettered` | Messages routés en DLQ avec succès (seuil de retries atteint ou enveloppe illisible). | Non nul ⇒ inspecter `deferred_effects_dlq` (voir « Procédure de reprise »). |
| `deadLetterFailed` | Routage DLQ tenté mais échoué : le message reste en file, redeviendra visible à l'expiration du VT. | Persistant ⇒ message empoisonné que la file ne peut pas évacuer ; voir journal `[deferred-effects] routage DLQ impossible` (jobId + msgId). |
| `failed` | Le handler a levé une erreur ; échec journalisé dans `deferred.effect_failures`, message resté en file pour retry. | Persistant sur le même message ⇒ `select * from deferred.effect_failures where message_id = '<uuid>' ...`. |
| `stoppedForTime` | `true` : la deadline (50 s) a été atteinte avant la fin du lot. | Attendu occasionnellement sous charge ; persistant ⇒ le lot est trop lourd ou le traitement trop lent pour la fenêtre de 50 s. |
| `hasMore` | `true` quand du travail reste très probablement en file : lot revenu plein (`read === batchSize`) ou arrêt sur deadline. Une exécution ne traite QU'UN lot. `false` avec `skipped: true` ne signifie rien : aucun lot n'a été lu. | Persistant ⇒ la file se remplit plus vite qu'elle ne se vide ; augmenter la fréquence du cron ou `batchSize`. |
| `durationMs` | Durée réelle de l'exécution. | Proche de 50 000 ms en continu ⇒ même diagnostic que `stoppedForTime`. |

**`replayDeadLetteredEffects` → `ReplayDeadLetteredEffectsResult`** :

| Champ | Signification | Diagnostic si non nul / inattendu |
|---|---|---|
| `jobId` | Identifiant de corrélation (fourni ou généré). | — |
| `skipped` / `reason` | Mêmes sémantiques que pour `processDeferredEffects`. | — |
| `read` | Entrées DLQ lues ce tick. | — |
| `replayed` | Enveloppes republiées avec succès sur `deferred_effects`. | — |
| `discarded` | Entrées DLQ illisibles (enveloppe non parseable) retirées de la tête de file — que leur mise à l'écart ait réussi par archivage ou soit retombée sur le repli quarantaine. | Non nul ⇒ voir « Entrées DLQ illisibles » ci-dessous. |
| `archived` | Sous-ensemble de `discarded` effectivement déplacé dans la table d'archive pgmq (`pgmq.archive` a réussi). | `discarded > archived` ⇒ l'archivage a échoué pour au moins une entrée ; elle est repassée en quarantaine (VT = 3 600 s) plutôt qu'archivée — voir journal `[deferred-effects] archivage DLQ impossible`. |
| `failed` | Republication tentée mais échouée (enveloppe rejetée par `deferred.publish_effect`, queue absente, connexion perdue) : l'entrée reste en DLQ, redeviendra visible à l'expiration du VT. | Persistant ⇒ journal `[deferred-effects] rejeu DLQ impossible` (jobId + msgId + messageId). |
| `hasMore` | `true` quand le lot est revenu plein : relancer la reprise pour vider la DLQ. | — |
| `messageIds` | `messageId` métier de chaque entrée effectivement rejouée. | — |

## Planification (Supabase Cron)

Le SQL de planification vit dans `supabase/cron/deferred-effects.sql`. Il **n'est appliqué par aucune automatisation** : `pg_cron` et `pg_net` sont des ressources de plateforme provisionnées au niveau du projet Supabase, en dehors de `supabase/config.toml` (qui ne comporte aucune section `pg_cron` ni `queues`). Il doit être collé et exécuté à la main dans le SQL Editor de chaque environnement (preview / staging / production), par un opérateur habilité, après :

1. avoir remplacé `<DEFERRED_EFFECTS_WORKER_SECRET_VALUE>` par la valeur réelle du secret de cet environnement (identique à `DEFERRED_EFFECTS_WORKER_SECRET` côté Vercel) ;
2. avoir remplacé `<APP_BASE_URL>` par l'URL publique du déploiement Vercel de cet environnement ;
3. **avoir vérifié la forme de lecture du secret Vault avant d'appliquer le bloc `cron.schedule`** — voir avertissement ci-dessous.

Intervalle retenu : **toutes les minutes** (`* * * * *`), cohérent avec le `maxDuration` de 60 s. Le VT de 30 s garantit qu'un message lu puis abandonné redevient visible bien avant le tick suivant du cron — voir « Ordre qui fait contrat : VT < deadline < maxDuration » plus haut. Une exécution qui déborde d'une minute n'est pas dangereuse : le verrou consultatif absorbe le chevauchement.

### Avertissement — forme du secret Vault à vérifier

La story exige explicitement de ne pas deviner cette forme : elle **varie selon la version de l'extension Supabase Vault**. `supabase/cron/deferred-effects.sql` écrit le secret avec `vault.create_secret(secret, name, description)` (forme stable), mais **lit** le secret via la vue `vault.decrypted_secrets` — la forme documentée par le guide Supabase Cron au moment de l'écriture de cette story, mais pas garantie sur toutes les versions.

Avant d'appliquer le bloc `cron.schedule`, exécuter séparément dans le SQL Editor du projet cible :

```sql
select decrypted_secret from vault.decrypted_secrets
 where name = 'deferred_effects_worker_secret';
```

- Si la requête renvoie la valeur du secret : la forme du fichier est correcte, appliquer tel quel.
- Si elle échoue (vue absente, colonne renommée) : l'extension expose probablement une fonction dédiée à la place (par ex. `vault.read_secret(...)` selon les versions). Adapter le sous-select dans `supabase/cron/deferred-effects.sql`, puis reporter ici la forme réellement utilisée pour cet environnement.

## Procédure de reprise depuis la DLQ

Deux chemins, du plus sûr au plus manuel.

### 1. Chemin testé (recommandé) — `replayDeadLetteredEffects`

`src/workers/deferred-effects/index.ts` exporte `replayDeadLetteredEffects({ connection })`. C'est l'action de reprise que porte `replayAction` dans chaque enveloppe DLQ (`{ kind: "replay-to-queue", sourceQueue: "deferred_effects_dlq", targetQueue: "deferred_effects", worker: "src/workers/deferred-effects", operation: "replayDeadLetteredEffects" }`). Elle lit un lot de la DLQ, reconstruit l'enveloppe AD-1 d'origine (en écartant `jobId`, `failureReason`, `replayAction`), la republie sur `deferred_effects` via `deferred.publish_effect` (qui revalide l'enveloppe), puis supprime le message DLQ — republication et suppression dans la même transaction. Le `read_ct` repart à zéro : l'idempotence de consommation (`deferred.processed_messages`) reste la seule protection contre un double effet.

**Entrées DLQ illisibles** (enveloppe non parseable, ex. JSON corrompu) : `pgmq.read` sert les messages les plus anciens d'abord, donc une entrée illisible en tête de file bloquerait indéfiniment tous les messages récupérables situés derrière elle. Ces entrées sont désormais **archivées** (`pgmq.archive`) — elles quittent `deferred_effects_dlq` mais restent intégralement lisibles dans la table d'archive pgmq, rien n'est détruit. Le nom exact de cette table dépend de la version de pgmq installée (vérifier avec `\dt pgmq.a_*` si la requête suivante échoue) ; à date, pgmq nomme la table d'archive d'une queue `pgmq.a_<queue>`, avec les mêmes colonnes que la queue plus `archived_at`. Pour les inspecter :

```sql
select msg_id, read_ct, enqueued_at, archived_at, message
  from pgmq.a_deferred_effects_dlq
 order by archived_at desc;
```

Si l'archivage lui-même échoue (table d'archive absente, droits insuffisants), le worker se replie sur une mise à l'écart par timeout de visibilité (`pgmq.set_vt`, `QUARANTINE_VISIBILITY_SECONDS` = 3 600 s = 1 h) : dégradé, mais la file redevient traversable pendant une heure — l'entrée reste alors dans `deferred_effects_dlq` (visible via la requête `pgmq.q_deferred_effects_dlq` de la section suivante), pas dans la table d'archive. Ce repli est journalisé (`[deferred-effects] archivage DLQ impossible`, puis `mise à l'écart DLQ impossible` si le repli échoue aussi) — voir le tableau `discarded`/`archived` plus haut (section « Forme du résultat ») pour repérer l'écart entre les deux compteurs.

Ce chemin (republication nominale) est celui exercé par le canari d'intégration (`tests/integration/database-outbox-canary.mjs`, point « rejeu depuis la DLQ »). Le chemin des entrées illisibles (archivage / repli quarantaine) est couvert par les tests unitaires (`tests/unit/deferred-effects.test.mjs`, avec client `pg` simulé), pas par le canari d'intégration — voir « Ce qui est vérifié en CI » plus bas.

Exemple d'appel (script Node ponctuel, ou console d'administration) :

```js
import { replayDeadLetteredEffects } from "./src/workers/deferred-effects/index.ts";
import { getDatabasePool } from "./src/shared/kernel/index.ts";

const result = await replayDeadLetteredEffects({ connection: getDatabasePool() });
console.log(result); // { jobId, skipped, reason, read, replayed, discarded, archived, failed, hasMore, messageIds }
```

### 2. Inspection et reprise manuelle en SQL (urgence, sans accès Node)

Inspecter la DLQ sans en modifier l'état (ne pas utiliser `pgmq.read`, qui rend les messages invisibles pendant le VT) :

```sql
-- Le nom exact de la table dépend de la version de pgmq installée ; vérifier avec
-- \dt pgmq.* si la requête suivante échoue.
select msg_id, read_ct, enqueued_at,
       message->>'messageId'      as message_id,
       message->'failureReason'   as failure_reason
  from pgmq.q_deferred_effects_dlq
 order by enqueued_at;
```

Rejouer un message précis à la main (à réserver aux cas où `replayDeadLetteredEffects` est indisponible) :

```sql
begin;

-- Reconstruire STRICTEMENT l'enveloppe AD-1 : ne pas repropager jobId/failureReason/
-- replayAction, qui ne font pas partie de l'enveloppe d'origine.
select deferred.publish_effect(
  'deferred_effects',
  jsonb_build_object(
    'messageId',        message->>'messageId',
    'eventType',         message->>'eventType',
    'producer',          message->>'producer',
    'aggregateId',       message->>'aggregateId',
    'aggregateVersion', (message->>'aggregateVersion')::int,
    'payloadVersion',   (message->>'payloadVersion')::int,
    'occurredAt',        message->>'occurredAt',
    'payload',           message->'payload'
  )
)
from pgmq.q_deferred_effects_dlq
where msg_id = <msg_id à remplacer>;

select pgmq.delete('deferred_effects_dlq', <msg_id à remplacer>);

commit;
```

## Diagnostiquer un worker en erreur

1. **Historique des déclenchements Cron** :
   ```sql
   select jobid, runid, status, return_message, start_time, end_time
     from cron.job_run_details
    where jobid = (select jobid from cron.job where jobname = 'deferred-effects-worker')
    order by start_time desc
    limit 20;
   ```
2. **Réponses HTTP de `pg_net`** — chaque `net.http_post` déclenché par le Cron laisse une trace dans `net._http_response` :
   ```sql
   select id, status_code, content, error_msg, created
     from net._http_response
    order by created desc
    limit 20;
   ```
   Un `status_code` de 401 signale un secret Vault désynchronisé de `DEFERRED_EFFECTS_WORKER_SECRET` côté Vercel. Un `error_msg` non nul (timeout, DNS) signale un problème réseau ou une URL `<APP_BASE_URL>` incorrecte. Un `status_code` 500 avec `content` contenant `configuration_invalide` signale `DATABASE_URL` ou `DEFERRED_EFFECTS_WORKER_SECRET` absent côté Vercel (voir `requireDeferredEffectsEnvironment` dans `src/shared/config/environment.ts`).
3. **Journaux applicatifs Vercel** : le Route Handler journalise (`console.error`) avec le `jobId` en cas de configuration invalide ou d'échec d'exécution — corréler via `jobId` entre les logs Vercel et la réponse JSON du corps de `net._http_response.content`.
4. **État des files** : `select * from pgmq.metrics('deferred_effects');` et `select * from pgmq.metrics('deferred_effects_dlq');` donnent la profondeur de file et l'âge du message le plus ancien, utiles pour détecter un worker arrêté (file qui grossit sans traitement).
5. **Routage DLQ en échec** : le corps JSON de la réponse porte `deadLetterFailed > 0` quand un message aurait dû partir en DLQ mais que l'envoi a échoué (queue absente, droits, enveloppe trop grosse). Le message reste en file et redeviendra visible à l'expiration du VT ; le détail de l'erreur est journalisé côté Vercel avec `jobId` et `msgId` (préfixe `[deferred-effects] routage DLQ impossible`). Un `deadLetterFailed` persistant signale un message empoisonné que la file ne peut pas évacuer.
6. **Verrou consultatif resté détenu** : si chaque exécution répond `200 { skipped: true, reason: "advisory-lock-not-acquired" }` alors qu'aucune n'est en cours, chercher le journal `[deferred-effects] libération du verrou consultatif impossible` côté Vercel. Le worker détruit alors la connexion pour que le verrou tombe avec la session ; en cas de doute, `select * from pg_locks where locktype = 'advisory' and objid = 4210031003;` puis `select pg_terminate_backend(<pid>);` sur la session fautive.
7. **Échecs journalisés côté base** : `select * from deferred.effect_failures where message_id = '<uuid>' order by occurred_at desc;` donne le détail (`error_code`, `error_message`, `read_ct`) de chaque tentative échouée pour un message donné — table alimentée dans une transaction séparée du `ROLLBACK` métier, donc jamais perdue.
8. **Publication refusée par un producteur (`22023`)** : si une mutation échoue à l'appel de `deferred.publish_effect`, l'erreur Postgres remonte au code appelant avec le message détaillé produit par la fonction (liste des champs fautifs : absents, `null`, mauvais type, UUID/chaîne/entier invalide). Chercher ce message dans les logs applicatifs du producteur (jamais côté worker, qui ne voit jamais ces enveloppes) ; corriger l'enveloppe envoyée, pas la fonction SQL.

## Ce qui est vérifié en CI, et ce qui ne l'est pas

**Vérifié par `npm run ci:database` (`scripts/run-database-gates.mjs`), sur une pile Supabase locale éphémère :**
- la migration `supabase/migrations/20260805000100_deferred_effects_expand.sql` (extension pgmq, queues, `deferred.publish_effect`, tables `deferred.processed_messages` / `deferred.effect_failures`, RLS et `revoke`/`grant`) ;
- les assertions pgTAP de `supabase/tests/database/deferred-effects.test.sql`, qui couvrent désormais la validation par type/validité de `deferred.publish_effect` : enveloppe vide, non-objet, champ absent, `null`, UUID/entier/chaîne invalide — chaque cas attendu en erreur `22023` ;
- le canari Node `tests/integration/database-outbox-canary.mjs` qui prouve par exécution réelle (jamais par inspection de texte) : rollback ⇒ aucun message publié, rejeu du même `messageId` ⇒ effet appliqué une seule fois (deux connexions distinctes), `read_ct` au-delà du seuil ⇒ DLQ avec ses quatre champs, rejeu depuis la DLQ (chemin nominal, enveloppe bien formée) ⇒ traitement réussi, appel sans header valide ⇒ 401, lot borné à `qty` messages consommés sur `qty + 5` en file.

**Vérifié par `npm run ci:unit` (`tests/unit/deferred-effects.test.mjs`), avec un client `pg` simulé (pas de Postgres réel) :**
- la validation des options du worker (`DeferredEffectsOptionsError` / `INVALID_WORKER_OPTIONS`) pour chaque cas incohérent (queues identiques, `batchSize`/`retryThreshold`/`shutdownMarginMs` invalides, etc.) ;
- la sémantique de `hasMore` (lot plein, lot partiel, file vide, arrêt sur deadline) ;
- le chemin des entrées DLQ illisibles lors du rejeu : archivage réussi (`discarded`/`archived` incrémentés ensemble) et repli quarantaine quand `pgmq.archive` échoue (`discarded` incrémenté, `archived` non incrémenté).

**Non vérifié en CI, et ne peut pas l'être avec le harnais actuel :**
- **Le Cron lui-même.** `pg_cron` et `pg_net` sont des ressources de *plateforme* Supabase, provisionnées au niveau du projet et non pilotées par `supabase/config.toml` — le harnais CI ne démarre ni Studio, ni Realtime, ni aucune API HTTP Supabase, et n'a jamais fait tourner pg_cron. `supabase/cron/deferred-effects.sql` n'est donc appliqué par aucune commande automatisée, ni en local ni en CI : c'est un artefact opérationnel, appliqué à la main par environnement.
- **`pgmq.archive` contre un pgmq réel.** Le comportement d'archivage des entrées DLQ illisibles (existence de la table `pgmq.a_deferred_effects_dlq`, nom exact de ses colonnes) n'est exercé qu'avec un client `pg` simulé côté unitaire ; ni le canari ni les assertions pgTAP ne produisent d'entrée DLQ illisible pour l'exercer contre une vraie extension pgmq. Vérifier `\dt pgmq.a_*` et le contenu réel après un premier archivage en environnement.
- **La forme de lecture du secret Vault** (`vault.decrypted_secrets` contre fonction dédiée) : dépend de la version de l'extension Vault du projet Supabase réel, jamais installée dans le harnais CI. Doit être vérifiée en SQL Editor avant chaque application (voir section « Avertissement » ci-dessus).
- **Le déploiement réel du Route Handler sur Vercel** (URL publique, variables d'environnement effectivement configurées côté plateforme) : la CI valide la logique du Route Handler et du worker via `node --test`, jamais un déploiement Vercel réel.
- **Le comportement réel de `net.http_post`** en production (latence, timeouts réseau, limites de débit Supabase Queues) : non simulé, non mesuré par la CI.

## Variables d'environnement requises

Lues et validées par `src/shared/config/environment.ts` (`readDeferredEffectsEnvironment` / `requireDeferredEffectsEnvironment`). **Optionnelles au build** (le prérendu Next ne parle pas à Postgres), **obligatoires à l'exécution** du Route Handler — leur absence ou incohérence lève une erreur explicite, jamais un défaut implicite.

| Variable | Rôle | Où la configurer |
|---|---|---|
| `DATABASE_URL` | Chaîne `postgresql://` vers la base Supabase de l'environnement, utilisée par `getDatabasePool()` (`src/shared/kernel/pool.ts`). Doit matcher `postgres(ql)?://...` et respecter la même règle d'isolation que le reste de la cible (rejetée si elle contient un marqueur `production`/`prod-` hors environnement `production`). | `.env.example` (exemple local, sans secret) ; variable d'environnement du projet Vercel pour preview/staging/production ; jamais commitée en clair. |
| `DEFERRED_EFFECTS_WORKER_SECRET` | Jeton comparé en temps constant à l'en-tête `Authorization: Bearer <secret>` par le Route Handler. Doit être **différent** de `SUPABASE_ANON_KEY` (vérifié explicitement). Valeur identique à celle inscrite en Vault via `supabase/cron/deferred-effects.sql`. | `.env.example` (placeholder local) ; variable d'environnement du projet Vercel ; secret Vault du projet Supabase (`vault.create_secret`, voir plus haut). |

`.env.example` porte déjà un exemple local sans secret pour les deux variables.

**Écart T6 vérifié et refermé (revue de code) : aucun ajout à `.github/workflows/ci.yml` n'était nécessaire.** La tâche T6 demandait de répercuter `DATABASE_URL` et `DEFERRED_EFFECTS_WORKER_SECRET` dans le bloc `env:` des jobs `quality` et `database`. Après vérification effective de ce qui consomme ces deux variables :

- **Job `database`** : `scripts/run-database-gates.mjs` injecte déjà lui-même `DATABASE_URL` et `DEFERRED_EFFECTS_WORKER_SECRET` — avec l'URL de la base éphémère réellement démarrée par le harnais et un secret jetable généré par exécution (`ci-outbox-${randomUUID()}`) — dans l'environnement du seul process qui en a besoin, `tests/integration/database-outbox-canary.mjs` (voir plus haut, ligne d'injection commentée « rester alignés sur la base éphémère du harnais »). Ajouter ces variables au bloc `env:` du job serait redondant et, pire, dangereux si les valeurs de workflow ne correspondaient pas exactement à `dbPort`/au secret jetable généré à l'exécution : cela écraserait silencieusement l'injection correcte par une valeur figée et fausse. Aucun ajout n'est fait.
- **Job `quality`** : aucun des scripts qu'il exécute (`ci:lint`, `ci:types`, `ci:unit`, `ci:integration`, `ci:environment`, `ci:static`, `ci:mutations`) n'appelle `requireDeferredEffectsEnvironment()` ni ne lit `DATABASE_URL`/`DEFERRED_EFFECTS_WORKER_SECRET` depuis `process.env` : ces fonctions ne sont invoquées qu'à l'intérieur du corps du Route Handler (`src/app/api/deferred-effects/process/route.ts`), jamais au chargement du module ni pendant le prérendu Next (route déclarée `dynamic = "force-dynamic"`). `npm run ci:static` (donc `next build`) passe sans ces variables, comme la story l'exige explicitement. Aucun ajout n'est fait.

En clair : la prémisse de la T6 (« sans quoi les tests échoueraient en CI ») ne se vérifie pas dans l'état actuel du code — ni `ci:static` ni aucun test de `ci:integration`/`ci:unit` ne dépend de ces variables au niveau du job. Si un futur cas d'usage venait à appeler `requireDeferredEffectsEnvironment()` en dehors du Route Handler (par ex. un test d'intégration qui l'exercerait directement via `process.env`), il faudrait alors réévaluer ce point.
