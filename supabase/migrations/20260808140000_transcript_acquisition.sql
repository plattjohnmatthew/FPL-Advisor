alter table public.transcripts
  add column duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  add column segments jsonb check (segments is null or jsonb_typeof(segments) = 'array');

create or replace function public.enforce_run_episode_status_transition()
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
    or (old.status = 'TRANSCRIPT_READY' and new.status in ('COMPLETED', 'EXTRACTING', 'FAILED'))
    or (old.status = 'EXTRACTING' and new.status in ('COMPLETED', 'FAILED'))
  ) then
    raise exception 'Invalid run episode status transition from % to %', old.status, new.status;
  end if;

  return new;
end;
$$;
