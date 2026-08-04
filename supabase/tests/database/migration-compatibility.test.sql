begin;
select plan(4);
select has_table('ci_migration_canary', 'contract', 'canonical migration history replayed from zero');
select results_eq(
  $$select phase from ci_migration_canary.proof order by case phase when 'expand' then 1 when 'migrate' then 2 else 3 end$$,
  array['expand', 'migrate', 'contract'],
  'expand, migrate and contract phases were applied in order'
);
select results_eq(
  $$select old_client_works and new_client_works from ci_migration_canary.proof where phase = 'migrate'$$,
  array[true],
  'old and new clients were both compatible during migrate'
);
select results_eq(
  $$select value from ci_migration_canary.new_client where id = 1$$,
  array['compatible'],
  'new client remains compatible after contract'
);
select * from finish();
rollback;
