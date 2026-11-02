alter table public.transcript_provider_calls
  add column error_code text,
  add column fallback_eligible boolean not null default false;

create index transcript_provider_calls_error_code_idx
  on public.transcript_provider_calls (error_code, completed_at desc)
  where error_code is not null;
