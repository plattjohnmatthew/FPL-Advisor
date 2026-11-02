create table public.transcript_provider_calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  episode_id uuid not null references public.episodes(id) on delete restrict,
  external_episode_id text not null,
  source_id uuid not null references public.sources(id) on delete restrict,
  processing_run_id uuid references public.processing_runs(id) on delete restrict,
  trigger text not null,
  transcript_existed_before_call boolean not null default false,
  success boolean not null,
  provider_response_status integer check (provider_response_status is null or provider_response_status between 100 and 599),
  ai_fallback_allowed boolean not null default false,
  ai_fallback_used boolean,
  duration_ms integer not null check (duration_ms >= 0),
  retry_attempt_count integer not null default 0 check (retry_attempt_count >= 0),
  http_request_count integer not null default 1 check (http_request_count >= 0),
  billable_request_count integer check (billable_request_count is null or billable_request_count >= 0),
  error_kind text,
  error_message text,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (completed_at >= started_at),
  check (not transcript_existed_before_call)
);

create index transcript_provider_calls_started_idx on public.transcript_provider_calls (started_at desc);
create index transcript_provider_calls_episode_idx on public.transcript_provider_calls (episode_id, started_at desc);
create index transcript_provider_calls_run_idx on public.transcript_provider_calls (processing_run_id) where processing_run_id is not null;

alter table public.transcript_provider_calls enable row level security;
create policy "service role manages transcript provider calls" on public.transcript_provider_calls for all to service_role using (true) with check (true);
