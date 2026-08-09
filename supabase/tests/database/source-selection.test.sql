begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_column('public', 'sources', 'selected_by_default', 'sources persist the default run selection');
select has_table('public', 'processing_run_sources', 'run source snapshots have a relational table');
select col_not_null('public', 'sources', 'selected_by_default', 'selection cannot be null');
select has_pk('public', 'processing_run_sources', 'run source snapshots reject duplicate membership');
select has_function('public', 'create_processing_run_with_sources', array['uuid[]','timestamp with time zone','timestamp with time zone','integer'], 'run and snapshot are created atomically');
select has_function('public', 'set_default_source_selection', array['uuid[]'], 'default selection is saved atomically');

select results_eq(
  $$ select count(*)::bigint from public.sources where enabled and selected_by_default $$,
  $$ values (2::bigint) $$,
  'existing active production sources remain selected'
);
select results_eq(
  $$ select count(*)::bigint from public.sources where not enabled and selected_by_default $$,
  $$ values (0::bigint) $$,
  'disabled fixtures are not selected by migration'
);

select throws_ok(
  $$ select public.create_processing_run_with_sources(array[]::uuid[], now(), now() + interval '1 day', 3) $$,
  '22023', 'Select at least one creator before processing.', 'zero-source runs are rejected'
);

select lives_ok(
  $$ select public.set_default_source_selection(array[(select id from public.sources where enabled limit 1)]) $$,
  'selection can be changed'
);
select results_eq(
  $$ select count(*)::bigint from public.sources where enabled and selected_by_default $$,
  $$ values (1::bigint) $$,
  'changed selection is persisted'
);

select lives_ok(
  $$ select public.create_processing_run_with_sources(array[(select id from public.sources where enabled and selected_by_default limit 1)], now(), now() + interval '1 day', 3) $$,
  'a run can be created from the selected active source'
);
select results_eq(
  $$ select count(*)::bigint from public.processing_run_sources where processing_run_id = (select id from public.processing_runs order by started_at desc limit 1) $$,
  $$ values (1::bigint) $$,
  'the run stores one source snapshot row'
);
select lives_ok(
  $$ select public.set_default_source_selection(array[(select id from public.sources where enabled and not selected_by_default limit 1)]) $$,
  'current selection can change after a run starts'
);
select results_eq(
  $$ select count(*)::bigint from public.processing_run_sources where processing_run_id = (select id from public.processing_runs order by started_at desc limit 1) $$,
  $$ values (1::bigint) $$,
  'later preference changes do not rewrite historical membership'
);
select throws_ok(
  $$ select public.create_processing_run_with_sources(array[(select id from public.sources where not enabled limit 1)], now(), now() + interval '1 day', 3) $$,
  '22023', 'One or more selected creators are missing or disabled.', 'disabled sources cannot be processed'
);
select throws_ok(
  $$ insert into public.processing_run_sources (processing_run_id, source_id) select processing_run_id, source_id from public.processing_run_sources limit 1 $$,
  '23505', null, 'duplicate run source membership is rejected'
);

select * from finish();
rollback;
