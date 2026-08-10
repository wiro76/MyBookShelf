begin;
select plan(43);

select has_schema('deferred', 'le schema dedie deferred existe');
select has_table('pgmq', 'q_deferred_effects', 'la queue pgmq deferred_effects existe');
select has_table('pgmq', 'q_deferred_effects_dlq', 'la queue pgmq deferred_effects_dlq existe');
select has_function(
  'deferred', 'publish_effect', array['text', 'jsonb'],
  'deferred.publish_effect(text, jsonb) existe'
);
select has_table('deferred', 'processed_messages', 'la table d idempotence de consommation existe');
select has_table('deferred', 'effect_failures', 'la table des echecs d effets existe');

select results_eq(
  $$select relrowsecurity from pg_class where oid = 'deferred.processed_messages'::regclass$$,
  array[true],
  'RLS activee sur deferred.processed_messages'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid = 'deferred.effect_failures'::regclass$$,
  array[true],
  'RLS activee sur deferred.effect_failures'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'deferred'$$,
  array[0::bigint],
  'aucune policy permissive sur le schema deferred'
);

select throws_ok(
  $$select deferred.publish_effect('deferred_effects', '{}'::jsonb)$$,
  '22023', null, 'enveloppe vide rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', '"pas un objet"'::jsonb)$$,
  '22023', null, 'enveloppe non objet rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe sans payloadVersion rejetee'
);

-- Presence != validite : `'{"payloadVersion": null}'::jsonb ? 'payloadVersion'` vaut vrai.
-- Sans controle de type, ces enveloppes partaient en queue et n'echouaient qu'a la
-- consommation, en DLQ. Le producteur doit echouer ICI, a la publication.
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', null::text,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec payloadVersion null rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', 'pas-un-uuid',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec messageId non UUID rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', 'pas-un-uuid-non-plus',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec aggregateId non UUID rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1.5,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec aggregateVersion non entier rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', '1',
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec payloadVersion en chaine rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', '',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec eventType vide rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', 1754352000,
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  '22023', null, 'enveloppe avec occurredAt non chaine rejetee'
);
select throws_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', 'pas un objet'
    ))$$,
  '22023', null, 'enveloppe avec payload non objet rejetee'
);

select ok(
  (select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000001',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000002',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))) > 0,
  'enveloppe complete acceptee et msg_id retourne'
);
select results_eq(
  $$select count(*)::bigint from pgmq.q_deferred_effects$$,
  array[1::bigint],
  'le message publie est present dans la queue deferred_effects'
);

-- Le worker se connecte en service_role, jamais en proprietaire de la base. Tous les
-- tests ci-dessus s'executent en postgres (superuser) : ils ne peuvent donc PAS voir un
-- droit manquant. publish_effect ecrit dans pgmq.q_deferred_effects via pgmq.send() ;
-- ce test verrouille l'acces reel du role d'execution a ce chemin.
set local role service_role;
select lives_ok(
  $$select deferred.publish_effect('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-000000000003',
      'eventType', 'ci.canary.effect.requested',
      'producer', 'ci-canary',
      'aggregateId', '018f5a1e-0000-7000-8000-000000000004',
      'aggregateVersion', 1,
      'payloadVersion', 1,
      'occurredAt', '2026-08-05T00:00:00Z',
      'payload', jsonb_build_object('kind', 'noop')
    ))$$,
  'service_role peut publier via deferred.publish_effect'
);
reset role;

set local role anon;
select throws_ok(
  $$select * from deferred.processed_messages$$,
  '42501', null, 'anon ne peut pas lire deferred.processed_messages'
);
select throws_ok(
  $$select * from deferred.effect_failures$$,
  '42501', null, 'anon ne peut pas lire deferred.effect_failures'
);

set local role authenticated;
select throws_ok(
  $$select * from deferred.processed_messages$$,
  '42501', null, 'authenticated ne peut pas lire deferred.processed_messages'
);
select throws_ok(
  $$select * from deferred.effect_failures$$,
  '42501', null, 'authenticated ne peut pas lire deferred.effect_failures'
);
reset role;

-- ---------------------------------------------------------------------------
-- Retention de deferred.processed_messages
-- ---------------------------------------------------------------------------
-- Cette table est la SEULE protection contre le double traitement. Une purge par
-- anciennete seule reactiverait silencieusement le double traitement de tout message
-- purge encore redelivrable. deferred.purge_processed_messages ne supprime que les lignes
-- dont le message n'existe plus dans aucune des quatre tables pgmq d'ou il pourrait
-- repartir : la file, la DLQ, et leurs deux archives.
select has_function(
  'deferred', 'purge_processed_messages', array['interval'],
  'deferred.purge_processed_messages(interval) existe'
);
select ok(
  exists(
    select 1 from pg_indexes
     where schemaname = 'deferred'
       and tablename = 'processed_messages'
       and indexname = 'processed_messages_processed_at_idx'
  ),
  'index sur processed_at : la purge filtre dessus avant les anti-jointures pgmq'
);
-- Memes garanties que publish_effect : sans security definer la purge ne peut pas lire
-- pgmq (service_role n'y a aucun droit) et declarerait purgeables des lignes encore
-- couvertes par un message en file ; sans search_path verrouille, les quatre `not exists`
-- sont detournables par un schema injecte.
select ok(
  (select p.prosecdef
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'deferred' and p.proname = 'purge_processed_messages'),
  'purge_processed_messages est security definer'
);
-- search_path est un GUC de type liste : `set search_path = ''` est stocke dans
-- pg_proc.proconfig sous la forme citee `search_path=""`, pas `search_path=`. On accepte
-- les deux formes plutot que de parier sur le rendu exact, et on exige surtout que ce soit
-- le MEME verrouillage que celui de deferred.publish_effect.
select ok(
  (select exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
      where n.nspname = 'deferred'
        and p.proname = 'purge_processed_messages'
        and cfg in ('search_path=', 'search_path=""')
   ))
   and (select p.proconfig
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'deferred' and p.proname = 'purge_processed_messages')
     = (select q.proconfig
          from pg_proc q
          join pg_namespace m on m.oid = q.pronamespace
         where m.nspname = 'deferred' and q.proname = 'publish_effect'),
  'purge_processed_messages verrouille son search_path comme publish_effect'
);
select ok(
  has_function_privilege('service_role', 'deferred.purge_processed_messages(interval)', 'execute'),
  'service_role peut executer deferred.purge_processed_messages'
);

-- Les noms des tables d'archive ne sont pas devinables : ils dependent de la version de
-- pgmq. La purge les interroge en dur ; ces deux assertions verrouillent le contrat.
select has_table('pgmq', 'a_deferred_effects', 'la table d archive de la file principale existe');
select has_table('pgmq', 'a_deferred_effects_dlq', 'la table d archive de la DLQ existe');

do $purge_setup$
declare
  v_msg_id bigint;
begin
  -- Un message en DLQ : replayDeadLetteredEffects peut encore le republier.
  perform pgmq.send('deferred_effects_dlq', jsonb_build_object(
    'messageId', '018f5a1e-0000-7000-8000-0000000000a1',
    'eventType', 'ci.canary.effect.requested',
    'failureReason', 'ci'
  ));

  -- Un message archive depuis la file principale : un operateur peut le reinjecter.
  -- pgmq.send est set-returning : meme forme d appel que deferred.publish_effect.
  select sent.msg_id
    into v_msg_id
    from pgmq.send('deferred_effects', jsonb_build_object(
      'messageId', '018f5a1e-0000-7000-8000-0000000000a2',
      'eventType', 'ci.canary.effect.requested'
    )) as sent(msg_id);
  perform pgmq.archive('deferred_effects', v_msg_id);

  insert into deferred.processed_messages (message_id, processed_at) values
    -- ...0001 a ete publie plus haut et est toujours dans pgmq.q_deferred_effects.
    ('018f5a1e-0000-7000-8000-000000000001', now() - interval '400 days'),
    ('018f5a1e-0000-7000-8000-0000000000a1', now() - interval '400 days'),
    ('018f5a1e-0000-7000-8000-0000000000a2', now() - interval '400 days'),
    -- Nulle part dans pgmq : plus redelivrable, donc seule ligne eligible.
    ('018f5a1e-0000-7000-8000-0000000000ff', now() - interval '400 days'),
    -- Hors fenetre de retention, meme absente de pgmq.
    ('018f5a1e-0000-7000-8000-0000000000fe', now());
end;
$purge_setup$;

select results_eq(
  $$select deferred.purge_processed_messages(interval '30 days')$$,
  array[1::bigint],
  'la purge ne supprime que la seule ligne reellement eligible'
);
select ok(
  exists(select 1 from deferred.processed_messages
          where message_id = '018f5a1e-0000-7000-8000-000000000001'),
  'ligne conservee : son message est encore dans pgmq.q_deferred_effects'
);
select ok(
  exists(select 1 from deferred.processed_messages
          where message_id = '018f5a1e-0000-7000-8000-0000000000a1'),
  'ligne conservee : son message est encore dans pgmq.q_deferred_effects_dlq'
);
select ok(
  exists(select 1 from deferred.processed_messages
          where message_id = '018f5a1e-0000-7000-8000-0000000000a2'),
  'ligne conservee : son message est encore dans pgmq.a_deferred_effects'
);
select ok(
  exists(select 1 from deferred.processed_messages
          where message_id = '018f5a1e-0000-7000-8000-0000000000fe'),
  'ligne conservee : hors fenetre de retention malgre son absence de pgmq'
);
select ok(
  not exists(select 1 from deferred.processed_messages
              where message_id = '018f5a1e-0000-7000-8000-0000000000ff'),
  'ligne supprimee : ancienne et absente des quatre tables pgmq'
);
select throws_ok(
  $$select deferred.purge_processed_messages(interval '-1 day')$$,
  '22023', null, 'fenetre de retention negative rejetee'
);

-- Rejouabilite de la migration : un echec partiel ne doit pas laisser un etat que la
-- relance refuse de reparer. On rejoue ici les deux seules instructions qui n'avaient
-- aucune garde d'existence, sur une base ou les objets existent deja.
select lives_ok(
  $$create schema if not exists deferred$$,
  'la creation du schema deferred est rejouable'
);
select lives_ok(
  $sql$do $replay$
begin
  if not exists (select 1 from pgmq.list_queues() as q where q.queue_name = 'deferred_effects') then
    perform pgmq.create('deferred_effects');
  end if;

  if not exists (select 1 from pgmq.list_queues() as q where q.queue_name = 'deferred_effects_dlq') then
    perform pgmq.create('deferred_effects_dlq');
  end if;
end;
$replay$$sql$,
  'la creation des queues pgmq est rejouable'
);

select * from finish();
rollback;
