begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_column('public', 'processing_runs', 'run_type', 'run type is durable');
select has_column('public', 'processing_runs', 'batch_submitted_count', 'submitted count is durable');
select has_column('public', 'processing_runs', 'batch_eligible_count', 'eligible count is durable');
select has_column('public', 'processing_runs', 'batch_already_processed_count', 'already-processed count is durable');
select has_table('public', 'processing_run_url_items', 'batch URL classifications are durable');
select has_column('public', 'processing_run_url_items', 'video_id', 'canonical video ID is stored');
select has_column('public', 'processing_run_url_items', 'episode_id', 'batch result can link to episode');

insert into public.processing_runs (id, status, run_type, batch_submitted_count, batch_eligible_count)
values ('91000000-0000-4000-8000-000000000001', 'RUNNING', 'SPECIFIC_URL_BATCH', 2, 1);
insert into public.processing_run_url_items (run_id, line_number, submitted_url, normalized_url, video_id, status)
values
  ('91000000-0000-4000-8000-000000000001', 1, 'https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk', 'VALID'),
  ('91000000-0000-4000-8000-000000000001', 2, 'bad', null, null, 'INVALID_URL');

select is((select count(*)::integer from public.processing_runs where id = '91000000-0000-4000-8000-000000000001'), 1, 'one batch uses one run');
select is((select count(*)::integer from public.processing_run_url_items where run_id = '91000000-0000-4000-8000-000000000001'), 2, 'each submitted nonblank line is classified');
select is((select run_type from public.processing_runs where id = '91000000-0000-4000-8000-000000000001'), 'SPECIFIC_URL_BATCH', 'batch run type is retained');
select throws_ok(
  $$ insert into public.processing_runs (status, run_type) values ('RUNNING', 'UNKNOWN') $$,
  '23514', null, 'unknown run types are rejected'
);
select throws_ok(
  $$ insert into public.processing_run_url_items (run_id, line_number, submitted_url, status) values ('91000000-0000-4000-8000-000000000001', 3, 'x', 'UNKNOWN') $$,
  '23514', null, 'unknown URL item states are rejected'
);
select throws_ok(
  $$ insert into public.processing_run_url_items (run_id, line_number, submitted_url, status) values ('91000000-0000-4000-8000-000000000001', 1, 'x', 'VALID') $$,
  '23505', null, 'one item per submitted line is enforced'
);
select is((select count(*)::integer from public.processing_run_url_items where status = 'VALID'), 1, 'valid and invalid classifications remain independent');

select * from finish();
rollback;
