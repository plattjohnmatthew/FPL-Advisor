begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'episodes', 'processing_paused_at', 'episode pause request is durable');
select enum_has_labels('public', 'episode_processing_status', array['DISCOVERED','TRANSCRIPT_FETCHING','TRANSCRIPT_READY','EXTRACTING','COMPLETED','FAILED','CANCELLED','PAUSED'], 'episode state includes PAUSED');

insert into public.sources (id, name, platform, channel_url, external_channel_id)
values ('92000000-0000-4000-8000-000000000001', 'Pause test', 'YOUTUBE', 'https://youtube.com/channel/pause-test', 'pause-test');
insert into public.episodes (id, source_id, external_episode_id, title, source_url, published_at, processing_paused_at)
values ('92000000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000001', 'pause-episode', 'Pause episode', 'https://youtu.be/pause-test', now(), now());
insert into public.processing_runs (id, status, run_type)
values ('92000000-0000-4000-8000-000000000003', 'RUNNING', 'MANUAL_EPISODE');
insert into public.run_episodes (run_id, episode_id, status)
values ('92000000-0000-4000-8000-000000000003', '92000000-0000-4000-8000-000000000002', 'DISCOVERED');

update public.run_episodes set status = 'PAUSED' where run_id = '92000000-0000-4000-8000-000000000003';
select is((select status::text from public.run_episodes where run_id = '92000000-0000-4000-8000-000000000003'), 'PAUSED', 'queued episode can transition to PAUSED');
select isnt((select processing_paused_at from public.episodes where id = '92000000-0000-4000-8000-000000000002'), null, 'pause survives as episode state');
select throws_ok(
  $$ update public.run_episodes set status = 'COMPLETED' where run_id = '92000000-0000-4000-8000-000000000003' $$,
  'P0001', null, 'paused attempts cannot skip directly to completed'
);

select * from finish();
rollback;
