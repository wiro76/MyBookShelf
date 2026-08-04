create extension if not exists pgmq;

-- Toute cette migration doit être rejouable de bout en bout : un échec partiel
-- (interruption, erreur sur une instruction ultérieure) ne doit pas laisser un état
-- que la relance refuse de réparer. D'où les gardes d'existence systématiques.
create schema if not exists deferred;

-- pgmq.create() n'expose aucune garantie d'idempotence contractuelle et varie selon la
-- version de l'extension : on interroge le registre de pgmq lui-même plutôt que de parier
-- dessus. La garde est un no-op quand la queue existe déjà.
do $migration$
begin
  if not exists (select 1 from pgmq.list_queues() as q where q.queue_name = 'deferred_effects') then
    perform pgmq.create('deferred_effects');
  end if;

  if not exists (select 1 from pgmq.list_queues() as q where q.queue_name = 'deferred_effects_dlq') then
    perform pgmq.create('deferred_effects_dlq');
  end if;
end;
$migration$;

-- SECURITY DEFINER : service_role n'a aucun droit sur le schéma pgmq, et ne doit pas
-- en recevoir. Lui accorder l'écriture directe sur les tables de queue lui permettrait
-- de publier en contournant la validation d'enveloppe AD-1 ci-dessous, alors que cette
-- fonction est précisément le seul point d'entrée censé la garantir. Elle publie donc
-- avec les droits de son propriétaire.
-- search_path vide : obligatoire avec SECURITY DEFINER pour empêcher la capture d'objet
-- par un schéma injecté. Tous les objets sont qualifiés ; le reste vient de pg_catalog,
-- qui demeure implicite.
-- La présence d'une clé ne vaut PAS validité : `'{"payloadVersion": null}'::jsonb ?
-- 'payloadVersion'` est vrai. Une validation par simple présence laissait donc publier des
-- enveloppes nulles ou mal typées, rejetées seulement à la consommation — c'est-à-dire en
-- DLQ, loin du producteur fautif. La validation ci-dessous vérifie le TYPE et la validité
-- de chaque valeur, en miroir exact du parseur TypeScript `parseDeferredEffectEnvelope`
-- (src/workers/deferred-effects/index.ts) : ce que le consommateur refuse, le producteur
-- doit le refuser d'abord.
create or replace function deferred.publish_effect(p_queue text, p_envelope jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Même motif que UUID_PATTERN côté worker.
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_problems text[] := '{}';
  v_key text;
  v_kind text;
  v_value jsonb;
  v_type text;
  v_msg_id bigint;
begin
  if p_queue is null or p_queue = '' then
    raise exception 'deferred.publish_effect: queue name is required'
      using errcode = '22023';
  end if;

  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    raise exception 'deferred.publish_effect: envelope must be a JSON object, got %',
      coalesce(jsonb_typeof(p_envelope), 'null')
      using errcode = '22023';
  end if;

  for v_key, v_kind in
    select spec.key, spec.kind
      from (values
        ('messageId', 'uuid'),
        ('eventType', 'text'),
        ('producer', 'text'),
        ('aggregateId', 'uuid'),
        ('aggregateVersion', 'integer'),
        ('payloadVersion', 'integer'),
        ('occurredAt', 'text'),
        ('payload', 'object')
      ) as spec(key, kind)
     order by 1
  loop
    if not (p_envelope ? v_key) then
      v_problems := v_problems || format('%s (missing)', v_key);
      continue;
    end if;

    v_value := p_envelope -> v_key;
    v_type := jsonb_typeof(v_value);

    if v_type = 'null' then
      v_problems := v_problems || format('%s (null is not an acceptable value)', v_key);
      continue;
    end if;

    case v_kind
      when 'uuid' then
        if v_type <> 'string' then
          v_problems := v_problems || format('%s (expected a UUID string, got %s)', v_key, v_type);
        elsif (v_value #>> '{}') !~* v_uuid_pattern then
          v_problems := v_problems || format('%s (expected a UUID string, got %L)', v_key, v_value #>> '{}');
        end if;
      when 'text' then
        if v_type <> 'string' then
          v_problems := v_problems || format('%s (expected a non-empty string, got %s)', v_key, v_type);
        elsif length(v_value #>> '{}') = 0 then
          v_problems := v_problems || format('%s (expected a non-empty string, got an empty string)', v_key);
        end if;
      when 'integer' then
        if v_type <> 'number' then
          v_problems := v_problems || format('%s (expected an integer, got %s)', v_key, v_type);
        elsif v_value::numeric <> trunc(v_value::numeric) then
          v_problems := v_problems || format('%s (expected an integer, got %s)', v_key, v_value #>> '{}');
        end if;
      when 'object' then
        if v_type <> 'object' then
          v_problems := v_problems || format('%s (expected a JSON object, got %s)', v_key, v_type);
        end if;
      else
        raise exception 'deferred.publish_effect: unknown validation kind %', v_kind;
    end case;
  end loop;

  if array_length(v_problems, 1) is not null then
    raise exception 'deferred.publish_effect: invalid envelope: %',
      array_to_string(v_problems, '; ')
      using errcode = '22023';
  end if;

  select sent.msg_id
    into v_msg_id
    from pgmq.send(p_queue, p_envelope) as sent(msg_id);

  return v_msg_id;
end;
$$;

create table if not exists deferred.processed_messages (
  message_id uuid primary key,
  processed_at timestamptz not null default now()
);

create table if not exists deferred.effect_failures (
  id bigserial primary key,
  message_id uuid not null,
  read_ct integer not null,
  error_code text,
  error_message text,
  occurred_at timestamptz not null default now()
);

create index if not exists effect_failures_message_id_idx
  on deferred.effect_failures (message_id, occurred_at desc);

-- Index de la purge : `deferred.purge_processed_messages` filtre d'abord sur `processed_at`
-- pour réduire l'ensemble candidat avant les quatre anti-jointures sur les tables pgmq.
-- Sans lui, chaque purge fait un seq scan de la table entière — précisément la table dont
-- la volumétrie motive la purge.
create index if not exists processed_messages_processed_at_idx
  on deferred.processed_messages (processed_at);

-- `deferred.processed_messages` reçoit une ligne par message traité, à vie, et c'est la
-- SEULE protection contre le double traitement (le worker teste l'existence de la ligne
-- avant d'appliquer l'effet). Une purge naïve — `delete from deferred.processed_messages
-- where processed_at < now() - interval '30 days'` — réactive donc silencieusement le
-- double traitement de tout message purgé qui serait encore redélivrable.
--
-- Raisonnement : un `message_id` n'est plus redélivrable quand son message n'existe plus
-- dans AUCUNE des quatre tables pgmq d'où il pourrait repartir. Noms vérifiés sur une
-- instance réelle (supabase/postgres 17.6.1.106, pgmq 1.5.1, `\dt pgmq.*`) :
--   pgmq.q_deferred_effects       — file principale (y compris messages invisibles, VT en
--                                   cours : ce sont des lignes ordinaires de cette table) ;
--   pgmq.q_deferred_effects_dlq   — DLQ, d'où `replayDeadLetteredEffects` republie ;
--   pgmq.a_deferred_effects       — archive de la file principale (`pgmq.archive`) ;
--   pgmq.a_deferred_effects_dlq   — archive de la DLQ (entrées illisibles mises à l'écart).
-- Les tables d'archive comptent : un opérateur peut réinjecter à la main une ligne
-- archivée. Tant qu'elle existe, la trace d'idempotence doit exister aussi.
--
-- Le rejeu DLQ ne crée pas de fenêtre de course : `replayDeadLetteredEffects` republie sur
-- `deferred_effects` et supprime l'entrée DLQ dans la MÊME transaction — le `message_id`
-- n'est donc jamais absent des quatre tables simultanément pendant l'opération.
--
-- SECURITY DEFINER + search_path vide, pour les mêmes raisons que `deferred.publish_effect` :
-- service_role n'a aucun droit sur le schéma pgmq et ne doit pas en recevoir (sinon il peut
-- lire/écrire les files hors de tout contrôle), alors que la purge doit impérativement
-- interroger ces quatre tables — un `not exists` qui échouerait faute de droits, ou qui
-- serait détourné par un schéma injecté dans le search_path, rendrait éligibles des lignes
-- qui ne le sont pas. Tous les objets sont donc qualifiés.
--
-- Comparaison en `lower(...)` : `publish_effect` accepte les UUID en majuscules (le motif
-- est testé avec `!~*`), alors que `uuid::text` rend toujours la forme minuscule. Une
-- comparaison sensible à la casse ne verrait pas un message encore en file publié avec un
-- UUID en majuscules, et le déclarerait purgeable — exactement le faux négatif à éviter.
create or replace function deferred.purge_processed_messages(
  p_retention interval default interval '90 days'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_deleted bigint;
begin
  if p_retention is null then
    raise exception 'deferred.purge_processed_messages: retention window is required'
      using errcode = '22023';
  end if;

  -- Une fenêtre négative reviendrait à purger des lignes situées dans le futur du curseur,
  -- c'est-à-dire des traces fraîches. Refus explicite plutôt que comportement surprenant.
  if p_retention < interval '0' then
    raise exception 'deferred.purge_processed_messages: retention window must not be negative, got %',
      p_retention
      using errcode = '22023';
  end if;

  v_cutoff := now() - p_retention;

  with purgeable as (
    select p.message_id
      from deferred.processed_messages as p
     where p.processed_at < v_cutoff
       and not exists (
         select 1
           from pgmq.q_deferred_effects as q
          where lower(q.message ->> 'messageId') = p.message_id::text
       )
       and not exists (
         select 1
           from pgmq.q_deferred_effects_dlq as d
          where lower(d.message ->> 'messageId') = p.message_id::text
       )
       and not exists (
         select 1
           from pgmq.a_deferred_effects as a
          where lower(a.message ->> 'messageId') = p.message_id::text
       )
       and not exists (
         select 1
           from pgmq.a_deferred_effects_dlq as ad
          where lower(ad.message ->> 'messageId') = p.message_id::text
       )
  )
  delete from deferred.processed_messages as target
   using purgeable
   where target.message_id = purgeable.message_id;

  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

alter table deferred.processed_messages enable row level security;
alter table deferred.effect_failures enable row level security;

revoke all on schema deferred from public;
revoke all on all tables in schema deferred from public;
revoke all on all functions in schema deferred from public;
revoke all on all sequences in schema deferred from public;

revoke all on schema deferred from anon, authenticated;
revoke all on all tables in schema deferred from anon, authenticated;
revoke all on all functions in schema deferred from anon, authenticated;
revoke all on all sequences in schema deferred from anon, authenticated;

grant usage on schema deferred to service_role;
grant select, insert, update, delete on deferred.processed_messages to service_role;
grant select, insert, update, delete on deferred.effect_failures to service_role;
grant usage, select on all sequences in schema deferred to service_role;
grant execute on function deferred.publish_effect(text, jsonb) to service_role;
grant execute on function deferred.purge_processed_messages(interval) to service_role;
