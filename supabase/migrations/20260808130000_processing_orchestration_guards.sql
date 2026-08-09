create unique index processing_runs_one_running_idx
  on public.processing_runs (status)
  where status = 'RUNNING';

create function public.enforce_run_episode_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'DISCOVERED' and new.status in ('TRANSCRIPT_FETCHING', 'FAILED'))
    or (old.status = 'TRANSCRIPT_FETCHING' and new.status in ('TRANSCRIPT_READY', 'FAILED'))
    or (old.status = 'TRANSCRIPT_READY' and new.status in ('EXTRACTING', 'FAILED'))
    or (old.status = 'EXTRACTING' and new.status in ('COMPLETED', 'FAILED'))
  ) then
    raise exception 'Invalid run episode status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger run_episodes_enforce_status_transition
before update of status on public.run_episodes
for each row execute function public.enforce_run_episode_status_transition();

create function public.enforce_checkpoint_monotonicity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.last_successful_published_at is not null and (
    new.last_successful_published_at is null
    or new.last_successful_published_at < old.last_successful_published_at
    or (
      new.last_successful_published_at = old.last_successful_published_at
      and old.last_successful_episode_external_id is not null
      and (
        new.last_successful_episode_external_id is null
        or new.last_successful_episode_external_id < old.last_successful_episode_external_id
      )
    )
  ) then
    raise exception 'Source checkpoints cannot move backwards';
  end if;

  return new;
end;
$$;

create trigger source_checkpoints_enforce_monotonicity
before update on public.source_checkpoints
for each row execute function public.enforce_checkpoint_monotonicity();

