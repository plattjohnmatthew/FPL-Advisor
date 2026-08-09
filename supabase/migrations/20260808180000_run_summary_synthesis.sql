alter table public.run_summaries
  add column summary_data jsonb,
  add column model text,
  add column input_tokens integer,
  add column output_tokens integer,
  add column total_tokens integer;

update public.run_summaries
set summary_data = jsonb_build_object(
      'overview', summary_text,
      'overviewInterpretation', 'CREATOR_CLAIM',
      'overviewSupportingInsightIds', jsonb_build_array('50000000-0000-4000-8000-000000000001'),
      'sections', jsonb_build_object(
        'keyDevelopments', '[]'::jsonb,
        'strongestTransferRecommendations', '[]'::jsonb,
        'negativePlayers', '[]'::jsonb,
        'captaincy', '[]'::jsonb,
        'fixtureDevelopments', '[]'::jsonb,
        'minutesInjuriesRotation', '[]'::jsonb,
        'priceValue', '[]'::jsonb,
        'chipsWildcard', '[]'::jsonb
      ),
      'splitDecisionIds', '[]'::jsonb
    ),
    model = 'legacy';

alter table public.run_summaries
  alter column summary_data set not null,
  alter column model set not null,
  add constraint run_summaries_data_object check (jsonb_typeof(summary_data) = 'object'),
  add constraint run_summaries_model_not_blank check (btrim(model) <> ''),
  add constraint run_summaries_input_tokens_nonnegative check (input_tokens is null or input_tokens >= 0),
  add constraint run_summaries_output_tokens_nonnegative check (output_tokens is null or output_tokens >= 0),
  add constraint run_summaries_total_tokens_nonnegative check (total_tokens is null or total_tokens >= 0);

create function public.persist_run_summary(
  target_run_id uuid,
  target_summary_text text,
  target_summary_data jsonb,
  target_generated_at timestamptz,
  target_prompt_version text,
  target_model text,
  target_input_tokens integer,
  target_output_tokens integer,
  target_total_tokens integer
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_id uuid;
begin
  insert into public.run_summaries (
    run_id, summary_text, summary_data, generated_at, prompt_version, model,
    input_tokens, output_tokens, total_tokens
  ) values (
    target_run_id, target_summary_text, target_summary_data, target_generated_at,
    target_prompt_version, target_model, target_input_tokens, target_output_tokens,
    target_total_tokens
  )
  on conflict (run_id, prompt_version) do update set
    summary_text = excluded.summary_text,
    summary_data = excluded.summary_data,
    generated_at = excluded.generated_at,
    model = excluded.model,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    total_tokens = excluded.total_tokens
  returning id into target_id;
  return target_id;
end;
$$;

revoke all on function public.persist_run_summary(uuid, text, jsonb, timestamptz, text, text, integer, integer, integer) from public;
grant execute on function public.persist_run_summary(uuid, text, jsonb, timestamptz, text, text, integer, integer, integer) to service_role;
