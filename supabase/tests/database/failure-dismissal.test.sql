begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into public.sources (id, name, platform, channel_url, external_channel_id)
values ('93000000-0000-4000-8000-000000000001', 'Dismiss test', 'YOUTUBE', 'https://youtube.com/channel/dismiss-test', 'dismiss-test');
insert into public.episodes (id, source_id, external_episode_id, title, source_url, published_at)
values ('93000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001', 'dismiss-test', 'Dismiss episode', 'https://youtu.be/dismiss-test', now());
insert into public.processing_runs (id, status, started_at)
values ('93000000-0000-4000-8000-000000000003', 'FAILED', now() - interval '1 hour');
insert into public.run_episodes (run_id, episode_id, status, error_message)
values ('93000000-0000-4000-8000-000000000003', '93000000-0000-4000-8000-000000000002', 'FAILED', 'Retained failure');
update public.run_episodes set failure_dismissed_at = now() where run_id = '93000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.latest_episode_processing_attempts where episode_id = '93000000-0000-4000-8000-000000000002' and failure_dismissed_at is null), 0, 'dismissed attempt hidden');
select is((select status::text from public.run_episodes where run_id = '93000000-0000-4000-8000-000000000003'), 'FAILED', 'true status retained');
select is((select error_message from public.run_episodes where run_id = '93000000-0000-4000-8000-000000000003'), 'Retained failure', 'error retained');
select is((select count(*)::int from public.episodes where id = '93000000-0000-4000-8000-000000000002'), 1, 'episode retained');
insert into public.processing_runs (id, status, started_at)
values ('93000000-0000-4000-8000-000000000004', 'CANCELLED', now());
insert into public.run_episodes (run_id, episode_id, status)
values ('93000000-0000-4000-8000-000000000004', '93000000-0000-4000-8000-000000000002', 'CANCELLED');
select is((select status::text from public.latest_episode_processing_attempts where episode_id = '93000000-0000-4000-8000-000000000002' and failure_dismissed_at is null), 'CANCELLED', 'new cancelled attempt resurfaces even without started_at');
select is((select count(*)::int from public.run_episodes where episode_id = '93000000-0000-4000-8000-000000000002'), 2, 'history retained');
select * from finish();
rollback;
