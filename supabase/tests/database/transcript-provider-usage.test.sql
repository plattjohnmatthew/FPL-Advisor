\ir demo-fixture.inc
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'transcript_provider_calls', 'transcript provider calls are auditable');
select has_column('public', 'transcript_provider_calls', 'trigger', 'provider call reason is stored');
select has_column('public', 'transcript_provider_calls', 'billable_request_count', 'provider billable credits are stored when reported');
select has_column('public', 'transcript_provider_calls', 'ai_fallback_used', 'AI fallback usage is tracked');
select has_column('public', 'transcript_provider_calls', 'provider_role', 'provider chain role is tracked');
select has_column('public', 'transcript_provider_calls', 'fallback_reason', 'fallback reason is tracked');
select has_column('public', 'transcript_provider_calls', 'fallback_provider', 'configured fallback provider is tracked');
select has_column('public', 'transcript_provider_calls', 'fallback_subsequently_used', 'fallback use is tracked');
select has_column('public', 'transcript_provider_calls', 'error_code', 'typed provider error code is tracked');
select has_column('public', 'transcript_provider_calls', 'fallback_eligible', 'fallback eligibility is tracked');

insert into public.transcript_provider_calls (provider, episode_id, external_episode_id, source_id, trigger, success, provider_response_status, ai_fallback_allowed, ai_fallback_used, duration_ms, retry_attempt_count, http_request_count, billable_request_count, started_at, completed_at)
values ('supadata', '20000000-0000-4000-8000-000000000001', 'seed-episode-forecast-1', '00000000-0000-4000-8000-000000000001', 'CREATOR_DISCOVERY', true, 200, false, false, 250, 0, 1, 1, now(), now());

select is((select count(*)::integer from public.transcript_provider_calls), 1, 'one provider acquisition creates one audit row');
select is((select billable_request_count from public.transcript_provider_calls limit 1), 1, 'billable response header value is retained');
select throws_ok(
  $$ insert into public.transcript_provider_calls (provider, episode_id, external_episode_id, source_id, trigger, transcript_existed_before_call, success, duration_ms, started_at, completed_at) values ('supadata', '20000000-0000-4000-8000-000000000001', 'seed-episode-forecast-1', '00000000-0000-4000-8000-000000000001', 'RETRY', true, true, 1, now(), now()) $$,
  '23514', null, 'provider calls cannot be recorded when a transcript already existed'
);
select throws_ok(
  $$ insert into public.transcript_provider_calls (provider, episode_id, external_episode_id, source_id, trigger, success, duration_ms, retry_attempt_count, started_at, completed_at) values ('supadata', '20000000-0000-4000-8000-000000000001', 'seed-episode-forecast-1', '00000000-0000-4000-8000-000000000001', 'RETRY', false, 1, -1, now(), now()) $$,
  '23514', null, 'negative retries are rejected'
);
select isnt((select indexname from pg_indexes where schemaname = 'public' and indexname = 'transcript_provider_calls_episode_idx'), null, 'episode audit index exists');

select * from finish();
rollback;
