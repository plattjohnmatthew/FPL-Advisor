create view public.latest_episode_processing_attempts
with (security_invoker = true)
as
select distinct on (run_episode.episode_id)
  run_episode.run_id,
  run_episode.episode_id,
  run_episode.status,
  run_episode.started_at,
  run_episode.completed_at,
  run_episode.transcript_status,
  run_episode.extraction_status,
  run_episode.error_message,
  run_episode.retry_count
from public.run_episodes as run_episode
order by run_episode.episode_id, run_episode.started_at desc nulls last, run_episode.run_id desc;

grant select on public.latest_episode_processing_attempts to service_role;
