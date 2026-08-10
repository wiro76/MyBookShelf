create schema ci_migration_canary;
create table ci_migration_canary.contract (
  id bigint primary key,
  old_value text not null,
  new_value text
);
create view ci_migration_canary.old_client as
  select id, old_value from ci_migration_canary.contract;
create table ci_migration_canary.proof (
  phase text primary key,
  old_client_works boolean not null,
  new_client_works boolean not null
);
insert into ci_migration_canary.contract(id, old_value) values (1, 'compatible');
insert into ci_migration_canary.proof values ('expand', true, false);
