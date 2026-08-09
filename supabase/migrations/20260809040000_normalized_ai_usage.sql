create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (task_type in ('TRANSCRIPT_EXTRACTION','QUERY_INTERPRETATION','SPLIT_DETECTION','SYNTHESIS','CHAT_ANSWER','STRUCTURED_OUTPUT_REPAIR')),
  model text not null check (btrim(model) <> ''),
  status text not null check (status in ('COMPLETED','FAILED')),
  request_id uuid,
  episode_id uuid references public.episodes(id) on delete restrict,
  processing_run_id uuid references public.processing_runs(id) on delete restrict,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens is null or cached_input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  estimated_cost_usd numeric(14,8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((status = 'FAILED' and input_tokens is null and cached_input_tokens is null and output_tokens is null and total_tokens is null)
    or (status = 'COMPLETED' and ((input_tokens is null and cached_input_tokens is null and output_tokens is null and total_tokens is null)
      or (input_tokens is not null and cached_input_tokens is not null and output_tokens is not null and total_tokens is not null)))),
  check (cached_input_tokens is null or input_tokens is null or cached_input_tokens <= input_tokens)
);

create index ai_usage_events_task_created_idx on public.ai_usage_events (task_type, created_at desc);
create index ai_usage_events_episode_idx on public.ai_usage_events (episode_id) where episode_id is not null;
create index ai_usage_events_run_idx on public.ai_usage_events (processing_run_id) where processing_run_id is not null;
create index ai_usage_events_request_idx on public.ai_usage_events (request_id) where request_id is not null;

alter table public.ai_usage_events enable row level security;
create policy "Service role manages AI usage events" on public.ai_usage_events for all to service_role using (true) with check (true);
grant all on table public.ai_usage_events to service_role;
