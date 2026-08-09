alter table public.sources
  add column if not exists selected_by_default boolean not null default false;

update public.sources
set selected_by_default = enabled;

create index if not exists sources_enabled_selected_idx
  on public.sources (enabled, selected_by_default);

create table if not exists public.processing_run_sources (
  processing_run_id uuid not null references public.processing_runs(id) on delete restrict,
  source_id uuid not null references public.sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (processing_run_id, source_id)
);

create index if not exists processing_run_sources_source_idx
  on public.processing_run_sources (source_id, processing_run_id);

alter table public.processing_run_sources enable row level security;

create policy "Service role manages processing run sources"
  on public.processing_run_sources for all to service_role
  using (true) with check (true);

grant all on table public.processing_run_sources to service_role;

create or replace function public.create_processing_run_with_sources(
  target_source_ids uuid[],
  target_discovery_start timestamptz,
  target_discovery_end timestamptz,
  target_youtube_max_videos_per_creator integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_run_id uuid;
  requested_count integer;
  valid_count integer;
begin
  select count(distinct source_id) into requested_count
  from unnest(target_source_ids) as selected(source_id);

  if requested_count = 0 then
    raise exception 'Select at least one creator before processing.' using errcode = '22023';
  end if;

  select count(*) into valid_count
  from public.sources
  where id = any(target_source_ids) and enabled = true;

  if valid_count <> requested_count then
    raise exception 'One or more selected creators are missing or disabled.' using errcode = '22023';
  end if;

  insert into public.processing_runs (
    status, discovery_start, discovery_end, youtube_max_videos_per_creator
  ) values (
    'RUNNING', target_discovery_start, target_discovery_end, target_youtube_max_videos_per_creator
  ) returning id into new_run_id;

  insert into public.processing_run_sources (processing_run_id, source_id)
  select new_run_id, source_id from unnest(target_source_ids) as selected(source_id)
  group by source_id;

  return new_run_id;
end;
$$;

grant execute on function public.create_processing_run_with_sources(uuid[], timestamptz, timestamptz, integer) to service_role;

create or replace function public.set_default_source_selection(target_source_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_count integer;
  valid_count integer;
begin
  select count(distinct source_id) into requested_count
  from unnest(target_source_ids) as selected(source_id);
  select count(*) into valid_count from public.sources
  where id = any(target_source_ids) and enabled = true;
  if valid_count <> requested_count then
    raise exception 'One or more selected creators are missing or disabled.' using errcode = '22023';
  end if;
  update public.sources set selected_by_default = (id = any(target_source_ids)) where true;
end;
$$;

grant execute on function public.set_default_source_selection(uuid[]) to service_role;
