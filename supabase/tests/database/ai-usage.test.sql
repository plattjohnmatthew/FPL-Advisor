begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'ai_usage_events', 'normalized AI usage ledger exists');
select has_column('public', 'ai_usage_events', 'task_type', 'usage records task type');
select has_column('public', 'ai_usage_events', 'model', 'usage records model');
select has_column('public', 'ai_usage_events', 'cached_input_tokens', 'usage records cached input tokens');
select has_column('public', 'ai_usage_events', 'estimated_cost_usd', 'usage records estimated cost');
select has_column('public', 'ai_usage_events', 'request_id', 'usage records request correlation ID');
select has_column('public', 'ai_usage_events', 'episode_id', 'usage can link an episode');
select has_column('public', 'ai_usage_events', 'processing_run_id', 'usage can link a processing run');

select lives_ok(
  $$ insert into public.ai_usage_events (task_type, model, status, input_tokens, cached_input_tokens, output_tokens, total_tokens, estimated_cost_usd, started_at, completed_at)
     values ('CHAT_ANSWER', 'gpt-5.4-mini', 'COMPLETED', 100, 20, 10, 110, 0.0001, now(), now()) $$,
  'complete usage with tokens is accepted'
);
select lives_ok(
  $$ insert into public.ai_usage_events (task_type, model, status, started_at, completed_at)
     values ('STRUCTURED_OUTPUT_REPAIR', 'gpt-5.4-mini', 'FAILED', now(), now()) $$,
  'failed calls without usage are accepted'
);
select throws_ok(
  $$ insert into public.ai_usage_events (task_type, model, status, started_at, completed_at) values ('UNKNOWN', 'gpt-5.4-mini', 'FAILED', now(), now()) $$,
  '23514', null, 'unknown tasks are rejected'
);
select throws_ok(
  $$ insert into public.ai_usage_events (task_type, model, status, input_tokens, cached_input_tokens, output_tokens, total_tokens, started_at, completed_at)
     values ('SYNTHESIS', 'gpt-5.4-mini', 'COMPLETED', 10, 11, 2, 12, now(), now()) $$,
  '23514', null, 'cached input cannot exceed input tokens'
);

select * from finish();
rollback;
