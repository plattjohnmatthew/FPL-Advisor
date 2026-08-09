alter table public.run_summaries
  add column eligible_episode_count integer not null default 0 check (eligible_episode_count >= 0),
  add column included_episode_count integer not null default 0 check (included_episode_count >= 0),
  add column excluded_episodes jsonb not null default '[]'::jsonb check (jsonb_typeof(excluded_episodes) = 'array'),
  add column distinct_creator_count integer not null default 0 check (distinct_creator_count >= 0);

update public.run_summaries rs
set eligible_episode_count = counts.included_count,
    included_episode_count = counts.included_count,
    distinct_creator_count = counts.creator_count
from (
  select se.synthesis_id, count(distinct se.episode_id)::integer included_count,
         count(distinct e.source_id)::integer creator_count
  from public.synthesis_episodes se
  join public.episodes e on e.id = se.episode_id
  group by se.synthesis_id
) counts
where counts.synthesis_id = rs.id;

drop function public.persist_scoped_synthesis(text, uuid, date, date, uuid[], text, jsonb, timestamptz, text, text, integer, integer, integer);

create function public.persist_scoped_synthesis(
  target_scope_type text, target_run_id uuid, target_from_date date, target_to_date date,
  target_episode_ids uuid[], target_eligible_episode_count integer, target_excluded_episodes jsonb,
  target_distinct_creator_count integer, target_summary_text text, target_summary_data jsonb,
  target_generated_at timestamptz, target_prompt_version text, target_model text,
  target_input_tokens integer, target_output_tokens integer, target_total_tokens integer
)
returns uuid language plpgsql set search_path = '' as $$
declare target_id uuid;
begin
  if target_eligible_episode_count <> coalesce(array_length(target_episode_ids, 1), 0) then
    raise exception 'Eligible and included episode counts must match for synthesis';
  end if;
  if jsonb_typeof(target_excluded_episodes) <> 'array' then
    raise exception 'Excluded synthesis episodes must be a JSON array';
  end if;
  insert into public.run_summaries (
    run_id, scope_type, from_date, to_date, summary_text, summary_data, generated_at,
    prompt_version, model, input_tokens, output_tokens, total_tokens,
    eligible_episode_count, included_episode_count, excluded_episodes, distinct_creator_count
  ) values (
    target_run_id, target_scope_type, target_from_date, target_to_date, target_summary_text,
    target_summary_data, target_generated_at, target_prompt_version, target_model,
    target_input_tokens, target_output_tokens, target_total_tokens,
    target_eligible_episode_count, coalesce(array_length(target_episode_ids, 1), 0),
    target_excluded_episodes, target_distinct_creator_count
  ) returning id into target_id;
  insert into public.synthesis_episodes (synthesis_id, episode_id)
  select target_id, distinct_episode_id from unnest(target_episode_ids) distinct_episode_id;
  return target_id;
end;
$$;

revoke all on function public.persist_scoped_synthesis(text, uuid, date, date, uuid[], integer, jsonb, integer, text, jsonb, timestamptz, text, text, integer, integer, integer) from public;
grant execute on function public.persist_scoped_synthesis(text, uuid, date, date, uuid[], integer, jsonb, integer, text, jsonb, timestamptz, text, text, integer, integer, integer) to service_role;
