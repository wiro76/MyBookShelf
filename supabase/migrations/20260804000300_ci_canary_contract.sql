alter table ci_migration_canary.contract alter column new_value set not null;
drop view ci_migration_canary.old_client;
alter table ci_migration_canary.contract drop column old_value;
insert into ci_migration_canary.proof
select 'contract', true,
  (select value = 'compatible' from ci_migration_canary.new_client where id = 1);
