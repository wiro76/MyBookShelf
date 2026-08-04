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
