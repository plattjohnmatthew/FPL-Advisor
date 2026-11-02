begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select has_table('public', 'fpl_selected_entry', 'selected FPL entry is persisted in Postgres');
select has_column('public', 'fpl_selected_entry', 'entry_id', 'selected entry stores the active FPL entry ID');
select has_index('public', 'fpl_squad_picks', 'fpl_squad_picks_snapshot_position_idx', 'current squad picks have an ordered snapshot index');

insert into public.fpl_selected_entry(singleton, entry_id)
values (true, 3555737)
on conflict (singleton) do update set entry_id = excluded.entry_id;

insert into public.fpl_selected_entry(singleton, entry_id)
values (true, 9999999)
on conflict (singleton) do update set entry_id = excluded.entry_id;

select is(
  (select entry_id from public.fpl_selected_entry where singleton),
  9999999::bigint,
  'changing the selected entry updates one durable database row'
);

select * from finish();
rollback;
