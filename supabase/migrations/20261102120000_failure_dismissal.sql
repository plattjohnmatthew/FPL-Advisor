-- Dismiss only this attempt. New failed attempts resurface automatically.
alter table public.run_episodes add column failure_dismissed_at timestamptz;

create or replace view public.latest_episode_processing_attempts
with (security_invoker = true) as
select distinct on (re.episode_id)
  re.run_id, re.episode_id, re.status, re.started_at, re.completed_at,
  re.transcript_status, re.extraction_status, re.error_message, re.retry_count,
  re.failure_dismissed_at
from public.run_episodes re
join public.processing_runs pr on pr.id = re.run_id
order by re.episode_id, pr.started_at desc, re.started_at desc nulls last, re.run_id desc;

grant select on public.latest_episode_processing_attempts to service_role;
