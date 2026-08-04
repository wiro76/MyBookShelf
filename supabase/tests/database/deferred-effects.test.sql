begin;
select plan(18);

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

select * from finish();
rollback;
