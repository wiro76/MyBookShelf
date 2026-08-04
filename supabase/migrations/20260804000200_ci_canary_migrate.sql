update ci_migration_canary.contract
set new_value = old_value
where new_value is null;
create view ci_migration_canary.new_client as
  select id, new_value as value from ci_migration_canary.contract;
insert into ci_migration_canary.proof
select 'migrate',
  (select old_value = 'compatible' from ci_migration_canary.old_client where id = 1),
  (select value = 'compatible' from ci_migration_canary.new_client where id = 1);
