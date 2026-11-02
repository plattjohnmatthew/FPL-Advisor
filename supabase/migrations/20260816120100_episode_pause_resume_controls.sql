alter table public.episodes add column processing_paused_at timestamptz;
create index episodes_processing_paused_idx on public.episodes (processing_paused_at) where processing_paused_at is not null;

alter table public.processing_runs drop constraint if exists processing_runs_run_type_check;
alter table public.processing_runs add constraint processing_runs_run_type_check check (run_type in ('CREATOR_DISCOVERY', 'SPECIFIC_URL_BATCH', 'MANUAL_EPISODE'));

alter table public.processing_run_url_items drop constraint if exists processing_run_url_items_status_check;
alter table public.processing_run_url_items add constraint processing_run_url_items_status_check check (status in (
  'VALID','DUPLICATE_IN_BATCH','INVALID_URL','UNSUPPORTED_URL','PENDING','PROCESSING','ALREADY_PROCESSED','COMPLETED','FAILED','CANCELLED','PAUSED'
));

create or replace function public.enforce_run_episode_status_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'DISCOVERED' and new.status in ('TRANSCRIPT_FETCHING', 'FAILED', 'CANCELLED', 'PAUSED'))
    or (old.status = 'TRANSCRIPT_FETCHING' and new.status in ('TRANSCRIPT_READY', 'FAILED', 'CANCELLED'))
    or (old.status = 'TRANSCRIPT_READY' and new.status in ('EXTRACTING', 'FAILED', 'CANCELLED', 'PAUSED'))
    or (old.status = 'EXTRACTING' and new.status in ('COMPLETED', 'FAILED', 'CANCELLED'))
  ) then raise exception 'Invalid run episode status transition from % to %', old.status, new.status; end if;
  if new.status = 'COMPLETED' and (
    new.transcript_status <> 'READY' or new.extraction_status <> 'COMPLETED'
    or not exists (select 1 from public.transcripts t where t.episode_id = new.episode_id)
    or not exists (select 1 from public.episode_extractions ee where ee.episode_id = new.episode_id)
    or not exists (select 1 from public.insights i where i.episode_id = new.episode_id)
  ) then raise exception 'Episode % cannot complete before transcript, extraction audit, and insights are durably persisted', new.episode_id; end if;
  return new;
end;
$$;
