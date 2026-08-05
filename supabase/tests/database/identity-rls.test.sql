begin;
select plan(14);

-- Story 1.6, AC 4. Calqué sur `rls.test.sql`, mais sur les tables réelles livrées par
-- 20260806000100_identity_expand.sql plutôt que sur un canari créé dans le test.
--
-- Les trois comptes sont semés sous le rôle de session (propriétaire), AVANT tout
-- changement de rôle : `identity.profiles` et `identity.private_notes` référencent
-- `auth.users(id)`, et le schéma `auth` est fourni par l'image de base — c'est ce qui rend
-- ce test possible sans GoTrue ni Kong.
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

-- ── Les privilèges d'abord, la politique ensuite ─────────────────────────────
-- Sans ces cinq premières assertions, les `42501` plus bas seraient ambigus : un refus
-- peut venir d'un défaut de privilège aussi bien que d'une politique. On établit donc que
-- `authenticated` A le droit d'écrire — donc que tout refus qu'il essuie vient de RLS — et
-- que `anon` n'a rien du tout.
select ok(
  has_schema_privilege('authenticated', 'identity', 'usage'),
  'authenticated peut utiliser le schema identity'
);
select ok(
  has_table_privilege('authenticated', 'identity.private_notes', 'insert'),
  'authenticated a le privilege d insertion : un refus sera un refus de RLS'
);
select ok(
  not has_schema_privilege('anon', 'identity', 'usage'),
  'anon n a aucun usage du schema identity'
);
select ok(
  not has_table_privilege('anon', 'identity.profiles', 'select'),
  'anon n a aucun privilege de lecture sur identity.profiles'
);
select ok(
  not has_table_privilege('anon', 'identity.private_notes', 'select'),
  'anon n a aucun privilege de lecture sur identity.private_notes'
);

-- ── anon n'a aucun acces ─────────────────────────────────────────────────────
set local role anon;
select throws_ok(
  'select * from identity.profiles',
  '42501', null, 'anon ne peut pas lire les profils'
);
select throws_ok(
  'select * from identity.private_notes',
  '42501', null, 'anon ne peut pas lire les notes privees'
);
reset role;

-- ── Le proprietaire lit et ecrit ses lignes ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into identity.profiles (user_id, display_name) values ('11111111-1111-1111-1111-111111111111', 'Zan');
insert into identity.private_notes (user_id, body) values ('11111111-1111-1111-1111-111111111111', 'note privee');

select results_eq('select count(*)::bigint from identity.profiles', array[1::bigint], 'owner can read own profile');
select results_eq('select count(*)::bigint from identity.private_notes', array[1::bigint], 'owner can read own notes');
select lives_ok(
  $$update identity.private_notes set body = 'note corrigee'$$,
  'owner can update own notes'
);

-- ── Un autre utilisateur ne voit rien et ne peut rien ecrire pour autrui ─────
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is_empty('select * from identity.profiles', 'other user cannot read profiles');
select is_empty('select * from identity.private_notes', 'other user cannot read notes');
select throws_ok(
  $$insert into identity.profiles (user_id, display_name) values ('33333333-3333-3333-3333-333333333333', 'usurpation')$$,
  '42501', null, 'other user cannot insert a profile for someone else'
);
select throws_ok(
  $$insert into identity.private_notes (user_id, body) values ('11111111-1111-1111-1111-111111111111', 'usurpation')$$,
  '42501', null, 'other user cannot insert a note for the owner'
);

select * from finish();
rollback;
