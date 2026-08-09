drop index if exists public.processing_runs_one_running_idx;
create unique index processing_runs_one_active_idx on public.processing_runs ((true))
where status in ('RUNNING', 'CANCELLING');

alter table public.processing_runs add column cancellation_requested_at timestamptz;

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
  return new;
end;
$$;

alter table public.run_summaries alter column run_id drop not null;
alter table public.run_summaries drop constraint if exists run_summaries_run_id_prompt_version_key;
alter table public.run_summaries
  add column scope_type text not null default 'RUN' check (scope_type in ('RUN', 'DATE_RANGE')),
  add column from_date date,
  add column to_date date;
alter table public.run_summaries add constraint run_summaries_scope_valid check (
  (scope_type = 'RUN' and run_id is not null and from_date is null and to_date is null)
  or (scope_type = 'DATE_RANGE' and run_id is null and from_date is not null and to_date is not null and from_date <= to_date)
);

create table public.synthesis_episodes (
  synthesis_id uuid not null references public.run_summaries(id) on delete restrict,
  episode_id uuid not null references public.episodes(id) on delete restrict,
  primary key (synthesis_id, episode_id)
);
create index synthesis_episodes_episode_idx on public.synthesis_episodes (episode_id);
alter table public.synthesis_episodes enable row level security;
grant select, insert on table public.synthesis_episodes to service_role;

create table public.synthesis_attempts (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('RUN', 'DATE_RANGE')),
  run_id uuid references public.processing_runs(id) on delete restrict,
  from_date date,
  to_date date,
  status text not null check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  synthesis_id uuid references public.run_summaries(id) on delete restrict,
  check (
    (scope_type = 'RUN' and run_id is not null and from_date is null and to_date is null)
    or (scope_type = 'DATE_RANGE' and run_id is null and from_date is not null and to_date is not null and from_date <= to_date)
  )
);
create index synthesis_attempts_requested_idx on public.synthesis_attempts (requested_at desc);
alter table public.synthesis_attempts enable row level security;
grant select, insert, update on table public.synthesis_attempts to service_role;

create function public.persist_scoped_synthesis(
  target_scope_type text, target_run_id uuid, target_from_date date, target_to_date date,
  target_episode_ids uuid[], target_summary_text text, target_summary_data jsonb,
  target_generated_at timestamptz, target_prompt_version text, target_model text,
  target_input_tokens integer, target_output_tokens integer, target_total_tokens integer
)
returns uuid language plpgsql set search_path = '' as $$
declare target_id uuid;
begin
  insert into public.run_summaries (
    run_id, scope_type, from_date, to_date, summary_text, summary_data, generated_at,
    prompt_version, model, input_tokens, output_tokens, total_tokens
  ) values (
    target_run_id, target_scope_type, target_from_date, target_to_date, target_summary_text,
    target_summary_data, target_generated_at, target_prompt_version, target_model,
    target_input_tokens, target_output_tokens, target_total_tokens
  ) returning id into target_id;
  insert into public.synthesis_episodes (synthesis_id, episode_id)
  select target_id, distinct_episode_id from unnest(target_episode_ids) distinct_episode_id;
  return target_id;
end;
$$;
revoke all on function public.persist_scoped_synthesis(text, uuid, date, date, uuid[], text, jsonb, timestamptz, text, text, integer, integer, integer) from public;
grant execute on function public.persist_scoped_synthesis(text, uuid, date, date, uuid[], text, jsonb, timestamptz, text, text, integer, integer, integer) to service_role;

create or replace function public.persist_run_summary(
  target_run_id uuid, target_summary_text text, target_summary_data jsonb,
  target_generated_at timestamptz, target_prompt_version text, target_model text,
  target_input_tokens integer, target_output_tokens integer, target_total_tokens integer
)
returns uuid language plpgsql set search_path = '' as $$
declare target_id uuid;
begin
  insert into public.run_summaries (
    run_id, scope_type, summary_text, summary_data, generated_at, prompt_version, model,
    input_tokens, output_tokens, total_tokens
  ) values (
    target_run_id, 'RUN', target_summary_text, target_summary_data, target_generated_at,
    target_prompt_version, target_model, target_input_tokens, target_output_tokens, target_total_tokens
  ) returning id into target_id;
  return target_id;
end;
$$;
