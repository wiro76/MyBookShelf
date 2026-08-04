create extension if not exists pgmq;

create schema deferred;

select pgmq.create('deferred_effects');
select pgmq.create('deferred_effects_dlq');

-- SECURITY DEFINER : service_role n'a aucun droit sur le schéma pgmq, et ne doit pas
-- en recevoir. Lui accorder l'écriture directe sur les tables de queue lui permettrait
-- de publier en contournant la validation d'enveloppe AD-1 ci-dessous, alors que cette
-- fonction est précisément le seul point d'entrée censé la garantir. Elle publie donc
-- avec les droits de son propriétaire.
-- search_path vide : obligatoire avec SECURITY DEFINER pour empêcher la capture d'objet
-- par un schéma injecté. Tous les objets sont qualifiés ; le reste vient de pg_catalog,
-- qui demeure implicite.
create function deferred.publish_effect(p_queue text, p_envelope jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_required constant text[] := array[
    'messageId',
    'eventType',
    'producer',
    'aggregateId',
    'aggregateVersion',
    'payloadVersion',
    'occurredAt',
    'payload'
  ];
  v_missing text[];
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

  select array_agg(key order by key)
    into v_missing
    from unnest(v_required) as key
   where not (p_envelope ? key);

  if v_missing is not null then
    raise exception 'deferred.publish_effect: incomplete envelope, missing key(s): %',
      array_to_string(v_missing, ', ')
      using errcode = '22023';
  end if;

  select sent.msg_id
    into v_msg_id
    from pgmq.send(p_queue, p_envelope) as sent(msg_id);

  return v_msg_id;
end;
$$;

create table deferred.processed_messages (
  message_id uuid primary key,
  processed_at timestamptz not null default now()
);

create table deferred.effect_failures (
  id bigserial primary key,
  message_id uuid not null,
  read_ct integer not null,
  error_code text,
  error_message text,
  occurred_at timestamptz not null default now()
);

create index effect_failures_message_id_idx
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
