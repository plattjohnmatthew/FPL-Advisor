-- Restore the RPC on hosted databases with incomplete split-detection schema.
-- Preserve all historical decisions and evidence.
create or replace function public.persist_split_decisions(
  target_run_id uuid,
  target_detection_version text,
  target_prompt_version text,
  target_model text,
  target_detected_at timestamptz,
  evaluated_insight_ids jsonb,
  detected_decisions jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  decision_item jsonb;
  position_item jsonb;
  evidence_id_text text;
  target_decision_id uuid;
  target_position_id uuid;
  decision_count integer := 0;
begin
  if jsonb_typeof(detected_decisions) <> 'array' then
    raise exception 'Detected split decisions must be a JSON array';
  end if;

  if jsonb_typeof(evaluated_insight_ids) <> 'array' then
    raise exception 'Evaluated insight IDs must be a JSON array';
  end if;

  for decision_item in select value from jsonb_array_elements(detected_decisions)
  loop
    insert into public.split_decisions (
      decision_key, subject, question, primary_category, time_horizon, status,
      unresolved_question, implication, detection_version, prompt_version,
      detection_model, last_detected_run_id, last_detected_at
    ) values (
      decision_item->>'decisionKey', decision_item->>'subject', decision_item->>'question',
      decision_item->>'primaryCategory', decision_item->>'timeHorizon', 'OPEN',
      decision_item->>'unresolvedQuestion', decision_item->>'implication',
      target_detection_version, target_prompt_version, target_model, target_run_id, target_detected_at
    )
    on conflict (decision_key) do update set
      subject = excluded.subject,
      question = excluded.question,
      primary_category = excluded.primary_category,
      time_horizon = excluded.time_horizon,
      unresolved_question = excluded.unresolved_question,
      implication = excluded.implication,
      detection_version = excluded.detection_version,
      prompt_version = excluded.prompt_version,
      detection_model = excluded.detection_model,
      last_detected_run_id = excluded.last_detected_run_id,
      last_detected_at = excluded.last_detected_at
    returning id into target_decision_id;

    for position_item in select value from jsonb_array_elements(decision_item->'positions')
    loop
      insert into public.split_positions (split_decision_id, position_key, position, reasoning)
      values (target_decision_id, position_item->>'positionKey', position_item->>'position', position_item->>'reasoning')
      on conflict (split_decision_id, position_key) do update set
        position = excluded.position,
        reasoning = excluded.reasoning
      returning id into target_position_id;

      for evidence_id_text in select value #>> '{}' from jsonb_array_elements(position_item->'supportingInsightIds')
      loop
        insert into public.split_position_insights (split_position_id, insight_id)
        values (target_position_id, evidence_id_text::uuid)
        on conflict do nothing;
      end loop;
    end loop;

    decision_count := decision_count + 1;
  end loop;

  for evidence_id_text in select value #>> '{}' from jsonb_array_elements(evaluated_insight_ids)
  loop
    insert into public.split_detection_insights (
      insight_id, detection_version, prompt_version, detection_model, processing_run_id, detected_at
    ) values (
      evidence_id_text::uuid, target_detection_version, target_prompt_version,
      target_model, target_run_id, target_detected_at
    )
    on conflict (insight_id, detection_version) do update set
      prompt_version = excluded.prompt_version,
      detection_model = excluded.detection_model,
      processing_run_id = excluded.processing_run_id,
      detected_at = excluded.detected_at;
  end loop;

  return decision_count;
end;
$$;

revoke all on function public.persist_split_decisions(uuid, text, text, text, timestamptz, jsonb, jsonb) from public;
grant execute on function public.persist_split_decisions(uuid, text, text, text, timestamptz, jsonb, jsonb) to service_role;

NOTIFY pgrst, 'reload schema';
