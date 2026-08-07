begin;
select plan(22);

insert into auth.users (id) values
  ('a1111111-1111-4111-8111-111111111111'),
  ('a2222222-2222-4222-8222-222222222222');

select ok(has_schema_privilege('authenticated', 'library', 'usage'), 'authenticated utilise library');
select ok(has_table_privilege('authenticated', 'library.modules', 'insert'), 'authenticated peut initialiser modules');
select ok(has_table_privilege('authenticated', 'library.shelves', 'insert'), 'authenticated peut initialiser shelves');
select ok(has_table_privilege('authenticated', 'library.copies', 'insert'), 'authenticated peut créer un copy plus tard');
select ok(not has_schema_privilege('anon', 'library', 'usage'), 'anon ne voit pas library');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);

insert into library.modules (user_id, status, module_position) values
  ('a1111111-1111-4111-8111-111111111111', 'want-to-read', 0);
insert into library.shelves (user_id, module_id, shelf_position)
select 'a1111111-1111-4111-8111-111111111111', id, 0 from library.modules where user_id = auth.uid() and status = 'want-to-read';
select results_eq('select count(*)::bigint from library.modules where user_id = auth.uid()', array[1::bigint], 'le propriétaire lit son module');
select results_eq('select count(*)::bigint from library.shelves where user_id = auth.uid()', array[1::bigint], 'le propriétaire lit son étagère');

select throws_ok($$
  insert into library.modules (user_id, status, module_position) values ('a2222222-2222-4222-8222-222222222222', 'want-to-read', 0)
$$, '42501', null, 'un autre utilisateur ne crée pas de module pour autrui');
select throws_ok($$
  insert into library.shelves (user_id, module_id, shelf_position)
  select 'a2222222-2222-4222-8222-222222222222', id, 1 from library.modules where user_id = 'a1111111-1111-4111-8111-111111111111'
$$, '42501', null, 'un autre utilisateur ne crée pas une étagère étrangère');

select throws_ok($$
  insert into library.modules (user_id, status, module_position) values ('a1111111-1111-4111-8111-111111111111', 'invalid', 1)
$$, '23514', null, 'un statut inconnu est rejeté');
select throws_ok($$
  insert into library.modules (user_id, status, module_position) values ('a1111111-1111-4111-8111-111111111111', 'reading', -1)
$$, '23514', null, 'un module négatif est rejeté');
select throws_ok($$
  insert into library.shelves (user_id, module_id, shelf_position)
  values ('a1111111-1111-4111-8111-111111111111', gen_random_uuid(), 0)
$$, '23503', null, 'une étagère sans module est rejetée');

select set_config('request.jwt.claim.sub', 'a2222222-2222-4222-8222-222222222222', true);
select is_empty('select * from library.modules', 'un autre utilisateur ne lit aucun module');
select is_empty('select * from library.shelves', 'un autre utilisateur ne lit aucune étagère');
select throws_ok($$ insert into library.copies (user_id, edition_id) values ('a1111111-1111-4111-8111-111111111111', gen_random_uuid()) $$, '42501', null, 'un autre utilisateur ne crée pas un copy autrui');

select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
insert into library.copies (user_id, edition_id) values ('a1111111-1111-4111-8111-111111111111', gen_random_uuid());
select ok(has_table_privilege('authenticated', 'library.placements', 'insert'), 'authenticated peut placer');
select ok(has_table_privilege('authenticated', 'library.placement_receipts', 'insert'), 'authenticated peut enregistrer un reçu');
select throws_ok($$ insert into library.placements (user_id, status, shelf_id, module_id, copy_id, item_position) values ('a1111111-1111-4111-8111-111111111111', 'want-to-read', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 0) $$, '23503', null, 'un placement sans cibles réelles est rejeté');
select ok(not has_table_privilege('authenticated', 'library.modules', 'delete'), 'la suppression directe des modules est interdite');
select ok(not has_table_privilege('authenticated', 'library.placements', 'delete'), 'la suppression directe des placements est interdite');
select ok(not has_table_privilege('anon', 'library.modules', 'select'), 'anon ne lit pas les modules');
select ok(not has_table_privilege('anon', 'library.placements', 'select'), 'anon ne lit pas les placements');

select * from finish();
rollback;
