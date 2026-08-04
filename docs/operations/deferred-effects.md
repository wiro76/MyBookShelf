# Exploitation des effets différés (story 1.3)

Infrastructure générique d'outbox transactionnel (AD-1, AD-12) : aucune fonctionnalité produit ne l'utilise encore. Les stories 2.4, 2.6/2.7, 5.3 et 5.5 y brancheront leurs effets métier.

## Schéma de bout en bout

1. **Mutation** : un cas d'usage écrit son effet métier et publie l'enveloppe AD-1 dans la **même transaction**, via `select deferred.publish_effect('deferred_effects', <enveloppe jsonb>)` (`supabase/migrations/20260805000100_deferred_effects_expand.sql`). La fonction valide que les huit clés de l'enveloppe (`messageId`, `eventType`, `producer`, `aggregateId`, `aggregateVersion`, `payloadVersion`, `occurredAt`, `payload`) sont présentes et lève une erreur sinon — un `ROLLBACK` de la mutation annule aussi la publication, gratuitement, puisque `pgmq.send()` est du SQL standard.
2. **Supabase Cron** déclenche `net.http_post` vers le Route Handler toutes les minutes (`supabase/cron/deferred-effects.sql`, non appliqué automatiquement — voir plus bas).
3. **Route Handler** : `POST /api/deferred-effects/process` (`src/app/api/deferred-effects/process/route.ts`). Il vérifie `Authorization: Bearer <DEFERRED_EFFECTS_WORKER_SECRET>` en temps constant (401 sans détail si absent ou invalide), génère un `jobId` UUIDv7, délègue au worker et renvoie son résultat en JSON. Aucune règle métier n'y vit (AD-2).
4. **Worker** (`src/workers/deferred-effects/index.ts`, fonction `processDeferredEffects`) : prend le verrou consultatif, lit un lot borné avec `pgmq.read`, traite chaque message dans sa propre transaction (idempotence + effet métier + `COMMIT`, puis seulement `pgmq.delete`), s'arrête proprement avant `maxDuration`, libère le verrou en `finally`.
5. **DLQ** : au-delà du seuil de retries, le message est routé vers `deferred_effects_dlq` avec une enveloppe enrichie (`jobId`, `failureReason`, `replayAction`), sans tentative de traitement.

## Valeurs opérationnelles réelles

Toutes lues dans `src/workers/deferred-effects/index.ts` (ce sont les constantes du contrat, pas des valeurs par défaut inventées) :

| Paramètre | Valeur | Constante |
|---|---|---|
| Seuil de retries avant DLQ | 5 (`read_ct > 5` ⇒ DLQ sans traitement, soit exactement 5 tentatives réelles) | `RETRY_THRESHOLD` |
| Taille de lot lu par exécution | 10 | `BATCH_SIZE` |
| Timeout de visibilité pgmq (VT) | 60 s | `VISIBILITY_TIMEOUT_SECONDS` |
| Clé du verrou consultatif (`pg_try_advisory_lock` / `pg_advisory_unlock`) | `4210031003` | `ADVISORY_LOCK_KEY` |
| `maxDuration` du worker (vu côté logique de boucle) | 60 000 ms | `MAX_DURATION_MS` |
| Marge d'arrêt propre avant `maxDuration` | 10 000 ms | `SHUTDOWN_MARGIN_MS` |
| Taille de lot rejoué par défaut depuis la DLQ | 10 | `REPLAY_BATCH_SIZE` |

Le Route Handler (`src/app/api/deferred-effects/process/route.ts`) déclare `export const maxDuration = 60;` (secondes) — cohérent avec `MAX_DURATION_MS`. Les noms de queues sont `deferred_effects` et `deferred_effects_dlq` (`DEFERRED_EFFECTS_QUEUE`, `DEFERRED_EFFECTS_DEAD_LETTER_QUEUE`), le schéma SQL est `deferred` (`DEFERRED_EFFECTS_SCHEMA`).

La concurrence est sérialisée **globalement** par le verrou consultatif : si une exécution est déjà en cours, la suivante répond `200 { skipped: true, reason: "advisory-lock-not-acquired" }` et ressort immédiatement sans erreur.

## Planification (Supabase Cron)

Le SQL de planification vit dans `supabase/cron/deferred-effects.sql`. Il **n'est appliqué par aucune automatisation** : `pg_cron` et `pg_net` sont des ressources de plateforme provisionnées au niveau du projet Supabase, en dehors de `supabase/config.toml` (qui ne comporte aucune section `pg_cron` ni `queues`). Il doit être collé et exécuté à la main dans le SQL Editor de chaque environnement (preview / staging / production), par un opérateur habilité, après :

1. avoir remplacé `<DEFERRED_EFFECTS_WORKER_SECRET_VALUE>` par la valeur réelle du secret de cet environnement (identique à `DEFERRED_EFFECTS_WORKER_SECRET` côté Vercel) ;
2. avoir remplacé `<APP_BASE_URL>` par l'URL publique du déploiement Vercel de cet environnement ;
3. **avoir vérifié la forme de lecture du secret Vault avant d'appliquer le bloc `cron.schedule`** — voir avertissement ci-dessous.

Intervalle retenu : **toutes les minutes** (`* * * * *`), cohérent avec le VT de 60 s et le `maxDuration` de 60 s. Une exécution qui déborde d'une minute n'est pas dangereuse : le verrou consultatif absorbe le chevauchement.

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

Ce chemin est celui exercé par le canari d'intégration (`tests/integration/database-outbox-canary.mjs`, point « rejeu depuis la DLQ »).

Exemple d'appel (script Node ponctuel, ou console d'administration) :

```js
import { replayDeadLetteredEffects } from "./src/workers/deferred-effects/index.ts";
import { getDatabasePool } from "./src/shared/kernel/index.ts";

const result = await replayDeadLetteredEffects({ connection: getDatabasePool() });
console.log(result); // { jobId, skipped, read, replayed, discarded, messageIds }
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

## Ce qui est vérifié en CI, et ce qui ne l'est pas

**Vérifié par `npm run ci:database` (`scripts/run-database-gates.mjs`), sur une pile Supabase locale éphémère :**
- la migration `supabase/migrations/20260805000100_deferred_effects_expand.sql` (extension pgmq, queues, `deferred.publish_effect`, tables `deferred.processed_messages` / `deferred.effect_failures`, RLS et `revoke`/`grant`) ;
- les assertions pgTAP de `supabase/tests/database/deferred-effects.test.sql` ;
- le canari Node `tests/integration/database-outbox-canary.mjs` qui prouve par exécution réelle (jamais par inspection de texte) : rollback ⇒ aucun message publié, rejeu du même `messageId` ⇒ effet appliqué une seule fois (deux connexions distinctes), `read_ct` au-delà du seuil ⇒ DLQ avec ses quatre champs, rejeu depuis la DLQ ⇒ traitement réussi, appel sans header valide ⇒ 401, lot borné à `qty` messages consommés sur `qty + 5` en file.

**Non vérifié en CI, et ne peut pas l'être avec le harnais actuel :**
- **Le Cron lui-même.** `pg_cron` et `pg_net` sont des ressources de *plateforme* Supabase, provisionnées au niveau du projet et non pilotées par `supabase/config.toml` — le harnais CI ne démarre ni Studio, ni Realtime, ni aucune API HTTP Supabase, et n'a jamais fait tourner pg_cron. `supabase/cron/deferred-effects.sql` n'est donc appliqué par aucune commande automatisée, ni en local ni en CI : c'est un artefact opérationnel, appliqué à la main par environnement.
- **La forme de lecture du secret Vault** (`vault.decrypted_secrets` contre fonction dédiée) : dépend de la version de l'extension Vault du projet Supabase réel, jamais installée dans le harnais CI. Doit être vérifiée en SQL Editor avant chaque application (voir section « Avertissement » ci-dessus).
- **Le déploiement réel du Route Handler sur Vercel** (URL publique, variables d'environnement effectivement configurées côté plateforme) : la CI valide la logique du Route Handler et du worker via `node --test`, jamais un déploiement Vercel réel.
- **Le comportement réel de `net.http_post`** en production (latence, timeouts réseau, limites de débit Supabase Queues) : non simulé, non mesuré par la CI.

## Variables d'environnement requises

Lues et validées par `src/shared/config/environment.ts` (`readDeferredEffectsEnvironment` / `requireDeferredEffectsEnvironment`). **Optionnelles au build** (le prérendu Next ne parle pas à Postgres), **obligatoires à l'exécution** du Route Handler — leur absence ou incohérence lève une erreur explicite, jamais un défaut implicite.

| Variable | Rôle | Où la configurer |
|---|---|---|
| `DATABASE_URL` | Chaîne `postgresql://` vers la base Supabase de l'environnement, utilisée par `getDatabasePool()` (`src/shared/kernel/pool.ts`). Doit matcher `postgres(ql)?://...` et respecter la même règle d'isolation que le reste de la cible (rejetée si elle contient un marqueur `production`/`prod-` hors environnement `production`). | `.env.example` (exemple local, sans secret) ; variable d'environnement du projet Vercel pour preview/staging/production ; jamais commitée en clair. |
| `DEFERRED_EFFECTS_WORKER_SECRET` | Jeton comparé en temps constant à l'en-tête `Authorization: Bearer <secret>` par le Route Handler. Doit être **différent** de `SUPABASE_ANON_KEY` (vérifié explicitement). Valeur identique à celle inscrite en Vault via `supabase/cron/deferred-effects.sql`. | `.env.example` (placeholder local) ; variable d'environnement du projet Vercel ; secret Vault du projet Supabase (`vault.create_secret`, voir plus haut). |

`.env.example` porte déjà un exemple local sans secret pour les deux variables. **À vérifier avant de clore la story** : au moment de la rédaction de cette page, `.github/workflows/ci.yml` ne définit encore que `APP_ENV`, `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans son bloc `env:` — `DATABASE_URL` et `DEFERRED_EFFECTS_WORKER_SECRET` n'y figurent pas. La tâche T6 de la story exige de les répercuter dans le bloc `env:` des jobs `quality` **et** `database`, faute de quoi les tests qui exercent `requireDeferredEffectsEnvironment()` échoueraient en CI. Ce point relève de la partie du lot qui touche `.github/workflows/ci.yml` (hors périmètre de cette page de documentation) ; il est signalé ici pour ne pas être perdu.
