-- Planification Supabase Cron du worker d'effets différés (story 1.3, AD-12).
--
-- ⚠️ CE FICHIER N'EST PAS APPLIQUÉ AUTOMATIQUEMENT.
-- Supabase Cron (pg_cron + pg_net) est une ressource de PLATEFORME, pas un objet de
-- `supabase/config.toml`. `supabase db reset` / `scripts/run-database-gates.mjs` ne
-- l'exécutent jamais, et aucune porte de `npm run ci:all` n'en dépend. Il doit être
-- collé et exécuté manuellement dans le SQL Editor du projet Supabase de chaque
-- environnement (preview / staging / production), par un opérateur habilité, après
-- avoir remplacé les deux placeholders `<...>` ci-dessous. Voir
-- `docs/operations/deferred-effects.md` pour la procédure complète et la liste de
-- vérifications préalables.
--
-- Idempotent : rejouable sans erreur (les extensions utilisent IF NOT EXISTS, le secret
-- Vault est recréé si absent, le job est reprogrammé s'il existe déjà).

-- ---------------------------------------------------------------------------
-- 1. Extensions requises
-- ---------------------------------------------------------------------------
-- pg_cron  : planification des tâches SQL périodiques (fonctions exposées dans le
--            schéma `cron`, créé par l'extension elle-même).
-- pg_net   : appels HTTP asynchrones depuis Postgres (net.http_post), dont les réponses
--            sont consultables dans `net._http_response`.
-- Ne pas forcer de clause `with schema` : Supabase provisionne ces extensions dans
-- leurs schémas dédiés (`cron`, `net`) de façon automatique.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 2. Secret Vault : jeton attendu par le Route Handler
-- ---------------------------------------------------------------------------
-- La valeur doit être IDENTIQUE à `DEFERRED_EFFECTS_WORKER_SECRET` configurée pour le
-- déploiement Vercel de cet environnement (voir `docs/operations/deferred-effects.md`,
-- section « Variables d'environnement »). Ne jamais committer la valeur réelle : ce
-- fichier ne contient qu'un placeholder à remplacer au moment de l'exécution manuelle,
-- puis à ne jamais laisser dans l'historique d'un éditeur SQL partagé.
--
-- `vault.create_secret(secret text, name text, description text)` est la forme stable
-- documentée par Supabase pour ÉCRIRE un secret. Elle ne semble pas varier selon la
-- version de l'extension Vault.
select vault.create_secret(
  '<DEFERRED_EFFECTS_WORKER_SECRET_VALUE>',
  'deferred_effects_worker_secret',
  'Jeton partagé avec DEFERRED_EFFECTS_WORKER_SECRET (Vercel) pour authentifier les appels de Supabase Cron vers /api/deferred-effects/process.'
);

-- ---------------------------------------------------------------------------
-- 3. Planification : appel du Route Handler toutes les minutes
-- ---------------------------------------------------------------------------
-- Intervalle retenu : chaque minute (`* * * * *`), cohérent avec le timeout de
-- visibilité pgmq de 60 s (VISIBILITY_TIMEOUT_SECONDS) et le `maxDuration` de 60 s du
-- Route Handler. Le verrou consultatif du worker (ADVISORY_LOCK_KEY) rend les
-- exécutions concurrentes sans danger si un déclenchement dépasse la minute : la
-- seconde invocation répond simplement `{ skipped: true }` et ressort.
--
-- Remplacer `<APP_BASE_URL>` par l'URL publique du déploiement Vercel de CET
-- environnement (voir `config/environments.json` pour le fingerprint attendu). Ne
-- jamais pointer un environnement non-production vers une URL de production.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'deferred-effects-worker') then
    perform cron.unschedule('deferred-effects-worker');
  end if;
end;
$$;

select cron.schedule(
  'deferred-effects-worker',
  '* * * * *',
  $cron$
  -- ⚠️ FORME À VÉRIFIER AVANT APPLICATION (voir avertissement en tête de fichier) :
  -- la lecture d'un secret Vault se fait ici via la vue `vault.decrypted_secrets`,
  -- forme documentée dans le guide Supabase Cron au moment de l'écriture de cette
  -- story. Certaines versions de l'extension Vault exposent à la place une fonction
  -- dédiée (par ex. `vault.read_secret(...)`). Exécuter la requête suivante seule dans
  -- le SQL Editor du projet cible AVANT d'appliquer ce fichier :
  --   select decrypted_secret from vault.decrypted_secrets
  --    where name = 'deferred_effects_worker_secret';
  -- Si elle échoue, remplacer le sous-select ci-dessous par l'équivalent réel de cette
  -- version de l'extension, puis documenter la forme retenue dans
  -- `docs/operations/deferred-effects.md`.
  select net.http_post(
    url := '<APP_BASE_URL>/api/deferred-effects/process',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'deferred_effects_worker_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $cron$
);

-- ---------------------------------------------------------------------------
-- Vérification post-application
-- ---------------------------------------------------------------------------
-- select * from cron.job where jobname = 'deferred-effects-worker';
-- select * from cron.job_run_details order by start_time desc limit 5;
-- select * from net._http_response order by created desc limit 5;
