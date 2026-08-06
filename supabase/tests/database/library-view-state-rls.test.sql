begin;
select plan(19);

insert into auth.users (id) values
  ('41111111-1111-4111-8111-111111111111'),
  ('42222222-2222-4222-8222-222222222222');

select ok(has_schema_privilege('authenticated', 'library', 'usage'), 'authenticated peut utiliser library');
select ok(has_table_privilege('authenticated', 'library.library_view_states', 'insert'), 'authenticated peut inserer son contexte');
select ok(has_table_privilege('authenticated', 'library.library_view_state_receipts', 'insert'), 'authenticated peut inserer son recu');
select ok(not has_schema_privilege('anon', 'library', 'usage'), 'anon ne peut pas utiliser library');
select ok(not has_table_privilege('anon', 'library.library_view_states', 'select'), 'anon ne peut pas lire les contextes');
select ok(not has_table_privilege('anon', 'library.library_view_state_receipts', 'select'), 'anon ne peut pas lire les recus');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41111111-1111-4111-8111-111111111111', true);

select lives_ok($$
  insert into library.library_view_states (
    user_id, status, module_id, shelf_id, copy_id,
    module_position, shelf_position, item_position, revision
  ) values (
    '41111111-1111-4111-8111-111111111111', 'finished',
    '51111111-1111-4111-8111-111111111111',
    '61111111-1111-4111-8111-111111111111',
    '71111111-1111-4111-8111-111111111111', 0, 0, 0, 1
  )
$$, 'le proprietaire cree son contexte');
select results_eq('select count(*)::bigint from library.library_view_states', array[1::bigint], 'le proprietaire lit son contexte');
select lives_ok('update library.library_view_states set revision = 2 where user_id = auth.uid()', 'le proprietaire met a jour son contexte');
select lives_ok($$
  insert into library.library_view_state_receipts (user_id, command_id, request_sha256, result_revision)
  values (
    '41111111-1111-4111-8111-111111111111',
    '81111111-1111-4111-8111-111111111111', repeat('a', 64), 2
  )
$$, 'le proprietaire cree son recu');
select results_eq('select count(*)::bigint from library.library_view_state_receipts', array[1::bigint], 'le proprietaire lit son recu');

select set_config('request.jwt.claim.sub', '42222222-2222-4222-8222-222222222222', true);
select is_empty('select * from library.library_view_states', 'un autre utilisateur ne voit aucun contexte');
select is_empty('select * from library.library_view_state_receipts', 'un autre utilisateur ne voit aucun recu');
select throws_ok($$
  insert into library.library_view_states (user_id, status, revision)
  values ('41111111-1111-4111-8111-111111111111', 'finished', 1)
$$, '42501', null, 'un autre utilisateur ne peut pas ecrire le contexte du proprietaire');
select throws_ok($$
  insert into library.library_view_state_receipts (user_id, command_id, request_sha256, result_revision)
  values ('41111111-1111-4111-8111-111111111111', gen_random_uuid(), repeat('b', 64), 1)
$$, '42501', null, 'un autre utilisateur ne peut pas ecrire un recu du proprietaire');

select throws_ok($$
  insert into library.library_view_states (user_id, status, shelf_id, shelf_position, revision)
  values ('42222222-2222-4222-8222-222222222222', 'finished', gen_random_uuid(), 0, 1)
$$, '23514', null, 'une etagere sans module est refusee');
select throws_ok($$
  insert into library.library_view_states (user_id, status, module_id, revision)
  values ('42222222-2222-4222-8222-222222222222', 'finished', gen_random_uuid(), 1)
$$, '23514', null, 'un identifiant sans indice est refuse');
select throws_ok($$
  insert into library.library_view_state_receipts (user_id, command_id, request_sha256, result_revision)
  values ('42222222-2222-4222-8222-222222222222', gen_random_uuid(), 'invalide', 1)
$$, '23514', null, 'un hash de demande invalide est refuse');
select throws_ok($$
  insert into library.library_view_states (user_id, status, revision)
  values ('42222222-2222-4222-8222-222222222222', 'unknown', 1)
$$, '23514', null, 'un statut inconnu est refuse');

select set_config('request.jwt.claim.sub', '41111111-1111-4111-8111-111111111111', true);
select ok(
  not has_table_privilege('authenticated', 'library.library_view_states', 'delete'),
  'la suppression directe ne peut pas reinitialiser la revision hors registre'
);

select * from finish();
rollback;
