-- Remove only the immutable demo fixture IDs. Fail closed if a source ID was repurposed.
do $$
begin
  if exists (
    select 1 from public.sources
    where id in (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003'
    ) and (external_channel_id not like 'seed-%' or channel_url not like 'https://example.com/%')
  ) then raise exception 'Demo cleanup stopped: deterministic source ID has non-demo identity'; end if;
end $$;

delete from public.synthesis_attempts where run_id = '10000000-0000-4000-8000-000000000001' or synthesis_id = '70000000-0000-4000-8000-000000000001';
delete from public.synthesis_episodes where synthesis_id = '70000000-0000-4000-8000-000000000001';
delete from public.run_summaries where id = '70000000-0000-4000-8000-000000000001' and prompt_version = 'seed-v1';
delete from public.split_position_insights where split_position_id in ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002');
delete from public.split_positions where id in ('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002');
delete from public.split_decisions where id = '60000000-0000-4000-8000-000000000001' and detection_version = 'seed-v1';
delete from public.insight_entities where insight_id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003');
delete from public.split_detection_insights where insight_id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003');
delete from public.insights where id in ('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003') and extraction_version = 'seed-v1';
delete from public.episode_extractions where episode_id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004');
delete from public.processing_failures where run_id = '10000000-0000-4000-8000-000000000001';
delete from public.run_episodes where run_id = '10000000-0000-4000-8000-000000000001';
delete from public.transcripts where id in ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003') and provider = 'seed';
delete from public.episodes where id in ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004') and external_episode_id like 'seed-%';
delete from public.processing_runs where id = '10000000-0000-4000-8000-000000000001';
delete from public.source_checkpoints where source_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
delete from public.sources where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003') and external_channel_id like 'seed-%';
delete from public.entities where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003')
  and not exists (select 1 from public.insight_entities ie where ie.entity_id = entities.id);
