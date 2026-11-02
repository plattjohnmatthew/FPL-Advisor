alter table public.ai_usage_events drop constraint if exists ai_usage_events_task_type_check;
alter table public.ai_usage_events add constraint ai_usage_events_task_type_check
  check (task_type in ('TRANSCRIPT_EXTRACTION','QUERY_INTERPRETATION','SPLIT_DETECTION','SYNTHESIS_REDUCTION','SYNTHESIS','CHAT_ANSWER','STRUCTURED_OUTPUT_REPAIR'));

create table public.creator_synthesis_briefs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  scope_type text not null check (scope_type in ('RUN','DATE_RANGE')),
  run_id uuid references public.processing_runs(id) on delete restrict,
  from_date date,
  to_date date,
  scope_identity text not null,
  input_hash text not null check (length(input_hash) = 64),
  prompt_version text not null,
  model text not null,
  brief_data jsonb not null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  created_at timestamptz not null default now(),
  check ((scope_type = 'RUN' and run_id is not null and from_date is null and to_date is null)
    or (scope_type = 'DATE_RANGE' and run_id is null and from_date is not null and to_date is not null and from_date <= to_date)),
  unique (source_id, scope_identity, input_hash, prompt_version, model)
);
create index creator_synthesis_briefs_source_created_idx on public.creator_synthesis_briefs(source_id, created_at desc);
alter table public.creator_synthesis_briefs enable row level security;
create policy "Service role manages creator synthesis briefs" on public.creator_synthesis_briefs for all to service_role using (true) with check (true);
grant all on table public.creator_synthesis_briefs to service_role;

alter table public.run_summaries
  add column synthesis_mode text not null default 'DIRECT' check (synthesis_mode in ('DIRECT','HIERARCHICAL')),
  add column eligible_insight_count integer not null default 0 check (eligible_insight_count >= 0),
  add column creator_brief_count integer not null default 0 check (creator_brief_count >= 0),
  add column excluded_creators jsonb not null default '[]'::jsonb check (jsonb_typeof(excluded_creators) = 'array'),
  add column reduction_model text,
  add column reduction_prompt_version text,
  add column reduction_input_tokens integer check (reduction_input_tokens is null or reduction_input_tokens >= 0),
  add column reduction_output_tokens integer check (reduction_output_tokens is null or reduction_output_tokens >= 0),
  add column final_input_tokens integer check (final_input_tokens is null or final_input_tokens >= 0),
  add column final_output_tokens integer check (final_output_tokens is null or final_output_tokens >= 0);
