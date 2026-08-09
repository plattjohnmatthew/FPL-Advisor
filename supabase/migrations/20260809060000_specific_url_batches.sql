alter table public.processing_runs
  add column run_type text not null default 'CREATOR_DISCOVERY'
    check (run_type in ('CREATOR_DISCOVERY', 'SPECIFIC_URL_BATCH')),
  add column batch_submitted_count integer not null default 0 check (batch_submitted_count >= 0),
  add column batch_eligible_count integer not null default 0 check (batch_eligible_count >= 0),
  add column batch_duplicate_count integer not null default 0 check (batch_duplicate_count >= 0),
  add column batch_invalid_count integer not null default 0 check (batch_invalid_count >= 0),
  add column batch_already_processed_count integer not null default 0 check (batch_already_processed_count >= 0);

create table public.processing_run_url_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.processing_runs(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  submitted_url text not null check (btrim(submitted_url) <> ''),
  normalized_url text,
  video_id text,
  status text not null check (status in (
    'VALID', 'DUPLICATE_IN_BATCH', 'ALREADY_PROCESSED', 'INVALID_URL', 'UNSUPPORTED_URL',
    'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'
  )),
  episode_id uuid references public.episodes(id) on delete restrict,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, line_number)
);

create index processing_run_url_items_run_status_idx on public.processing_run_url_items (run_id, status);
create index processing_run_url_items_video_idx on public.processing_run_url_items (video_id) where video_id is not null;

alter table public.processing_run_url_items enable row level security;
create policy "Service role manages processing URL items" on public.processing_run_url_items
  for all to service_role using (true) with check (true);
grant all on table public.processing_run_url_items to service_role;
