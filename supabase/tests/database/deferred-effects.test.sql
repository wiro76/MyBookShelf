begin;
select plan(29);

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
