-- Preserve the confirmed real manual-import corpus while repairing its temporary
-- development identity to the canonical configured YouTube source/video identity.
do $$
begin
  if exists (
    select 1 from public.sources
    where id = 'fb0103a1-165a-48cb-8da9-b5514d1af38c'
      and not (
        name = 'FPL Wire'
        and external_channel_id = 'test-729d90286a2b80101cf9927e2019502e'
        and channel_url = 'https://www.youtube.com/watch?v=4C44on7MDj4'
      )
  ) then raise exception 'Real source repair stopped: temporary source identity does not match the audited record'; end if;

  if exists (
    select 1 from public.episodes
    where id = '0ab03c17-15bc-4b5a-a4a1-23a0aa488d42'
      and not (
        source_id = 'fb0103a1-165a-48cb-8da9-b5514d1af38c'
        and source_url = 'https://www.youtube.com/watch?v=4C44on7MDj4'
      )
  ) then raise exception 'Real episode repair stopped: episode identity does not match the audited record'; end if;
end $$;

update public.episodes
set source_id = '00000000-0000-4000-8000-000000000011',
    external_episode_id = '4C44on7MDj4'
where id = '0ab03c17-15bc-4b5a-a4a1-23a0aa488d42'
  and source_id = 'fb0103a1-165a-48cb-8da9-b5514d1af38c'
  and source_url = 'https://www.youtube.com/watch?v=4C44on7MDj4';

delete from public.source_checkpoints where source_id = 'fb0103a1-165a-48cb-8da9-b5514d1af38c';
delete from public.sources
where id = 'fb0103a1-165a-48cb-8da9-b5514d1af38c'
  and external_channel_id = 'test-729d90286a2b80101cf9927e2019502e'
  and not exists (select 1 from public.episodes where source_id = sources.id);

-- A processing attempt may become COMPLETED only after the permanent episode
-- corpus has been committed. The existing trigger invokes this on status updates.
create or replace function public.enforce_run_episode_status_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'DISCOVERED' and new.status in ('TRANSCRIPT_FETCHING', 'FAILED', 'CANCELLED'))
    or (old.status = 'TRANSCRIPT_FETCHING' and new.status in ('TRANSCRIPT_READY', 'FAILED', 'CANCELLED'))
    or (old.status = 'TRANSCRIPT_READY' and new.status in ('EXTRACTING', 'FAILED', 'CANCELLED'))
    or (old.status = 'EXTRACTING' and new.status in ('COMPLETED', 'FAILED', 'CANCELLED'))
  ) then raise exception 'Invalid run episode status transition from % to %', old.status, new.status; end if;

  if new.status = 'COMPLETED' and (
    new.transcript_status <> 'READY'
    or new.extraction_status <> 'COMPLETED'
    or not exists (select 1 from public.transcripts t where t.episode_id = new.episode_id)
    or not exists (select 1 from public.episode_extractions ee where ee.episode_id = new.episode_id)
    or not exists (select 1 from public.insights i where i.episode_id = new.episode_id)
  ) then raise exception 'Episode % cannot complete before transcript, extraction audit, and insights are durably persisted', new.episode_id; end if;
  return new;
end;
$$;
