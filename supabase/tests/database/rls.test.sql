begin;
select plan(4);

create schema ci_canary;
create table ci_canary.private_rows(owner_id uuid not null, value text not null);
alter table ci_canary.private_rows enable row level security;
create policy own_rows on ci_canary.private_rows
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant usage on schema ci_canary to authenticated;
grant select, insert on ci_canary.private_rows to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into ci_canary.private_rows values ('11111111-1111-1111-1111-111111111111', 'owned');
select results_eq('select count(*)::bigint from ci_canary.private_rows', array[1::bigint], 'owner can read');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select is_empty('select * from ci_canary.private_rows', 'other user cannot read');
select throws_ok(
  $$insert into ci_canary.private_rows values ('11111111-1111-1111-1111-111111111111', 'forbidden')$$,
  '42501', null, 'other user cannot insert for owner'
);
select results_eq('select count(*)::bigint from ci_canary.private_rows', array[0::bigint], 'other user sees no rows');

select * from finish();
rollback;
