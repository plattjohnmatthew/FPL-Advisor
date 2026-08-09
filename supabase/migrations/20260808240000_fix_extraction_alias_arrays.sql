create or replace function public.persist_episode_insight_extraction(
  target_episode_id uuid,
  target_extraction_version text,
  target_prompt_version text,
  target_model text,
  target_input_tokens integer,
  target_output_tokens integer,
  target_total_tokens integer,
  target_extracted_at timestamptz,
  extracted_insights jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  insight_item jsonb; entity_item jsonb; validation_entity jsonb;
  new_insight_id uuid; matched_entity_id uuid;
  insight_index integer := 0; entity_index integer;
begin
  if jsonb_typeof(extracted_insights) is distinct from 'array' then
    raise exception 'Extraction validation failed: episode=% field=insights expected=array received=%',
      target_episode_id, coalesce(jsonb_typeof(extracted_insights), 'sql-null');
  end if;
  if exists (select 1 from public.episode_extractions where episode_id = target_episode_id and extraction_version = target_extraction_version) then return 0; end if;
  if not exists (select 1 from public.insights where episode_id = target_episode_id and extraction_version = target_extraction_version) then
    for insight_item in select value from jsonb_array_elements(extracted_insights) loop
      if jsonb_typeof(insight_item) is distinct from 'object' then
        raise exception 'Extraction validation failed: episode=% insight=% field=insight expected=object received=%',
          target_episode_id, insight_index, coalesce(jsonb_typeof(insight_item), 'sql-null');
      end if;
      if jsonb_typeof(insight_item->'tags') is distinct from 'array' then
        raise exception 'Extraction validation failed: episode=% insight=% field=tags expected=array received=%',
          target_episode_id, insight_index, coalesce(jsonb_typeof(insight_item->'tags'), 'missing');
      end if;
      if jsonb_typeof(insight_item->'entities') is distinct from 'array' then
        raise exception 'Extraction validation failed: episode=% insight=% field=entities expected=array received=%',
          target_episode_id, insight_index, coalesce(jsonb_typeof(insight_item->'entities'), 'missing');
      end if;
      entity_index := 0;
      for validation_entity in select value from jsonb_array_elements(insight_item->'entities') loop
        if jsonb_typeof(validation_entity) is distinct from 'object' then
          raise exception 'Extraction validation failed: episode=% insight=% field=entities[%] expected=object received=%',
            target_episode_id, insight_index, entity_index, coalesce(jsonb_typeof(validation_entity), 'sql-null');
        end if;
        if jsonb_typeof(validation_entity->'aliases') is distinct from 'array' then
          raise exception 'Extraction validation failed: episode=% insight=% field=entities[%].aliases expected=array received=%',
            target_episode_id, insight_index, entity_index, coalesce(jsonb_typeof(validation_entity->'aliases'), 'missing');
        end if;
        entity_index := entity_index + 1;
      end loop;

      insert into public.insights (episode_id, claim, reasoning, primary_category, recommendation, time_horizon, creator_confidence,
        valid_from_gameweek, valid_to_gameweek, evidence_text, timestamp_seconds, extraction_version, extraction_index, tags, extraction_model, prompt_version)
      values (target_episode_id, insight_item->>'claim', insight_item->>'reasoning', insight_item->>'primaryCategory', insight_item->>'recommendation',
        insight_item->>'timeHorizon', (insight_item->>'creatorConfidence')::public.creator_confidence,
        (insight_item->>'validFromGameweek')::smallint, (insight_item->>'validToGameweek')::smallint, insight_item->>'evidenceText',
        (insight_item->>'timestampSeconds')::integer, target_extraction_version, insight_index,
        array(select distinct value from jsonb_array_elements_text(insight_item->'tags') value), target_model, target_prompt_version)
      returning id into new_insight_id;

      for entity_item in
        select jsonb_build_object(
          'type', entity_type, 'canonicalName', min(canonical_name), 'role', min(entity_role),
          'aliases', coalesce(jsonb_agg(distinct alias_name) filter (where alias_name is not null and btrim(alias_name) <> ''), '[]'::jsonb)
        )
        from (
          select e->>'type' entity_type, btrim(e->>'canonicalName') canonical_name, btrim(e->>'role') entity_role, a.alias_name
          from jsonb_array_elements(insight_item->'entities') e
          left join lateral jsonb_array_elements_text(e->'aliases') a(alias_name) on true
        ) normalized
        group by entity_type, lower(canonical_name), lower(entity_role)
      loop
        select id into matched_entity_id from public.entities
        where type = (entity_item->>'type')::public.entity_type and lower(canonical_name) = lower(entity_item->>'canonicalName') limit 1;
        if matched_entity_id is null then
          insert into public.entities (type, canonical_name, aliases) values (
            (entity_item->>'type')::public.entity_type, entity_item->>'canonicalName',
            array(select jsonb_array_elements_text(entity_item->'aliases'))
          ) returning id into matched_entity_id;
        else
          update public.entities set aliases = array(
            select distinct alias_name from unnest(aliases || array(select jsonb_array_elements_text(entity_item->'aliases'))) alias_name where btrim(alias_name) <> ''
          ) where id = matched_entity_id;
        end if;
        insert into public.insight_entities (insight_id, entity_id, role)
        values (new_insight_id, matched_entity_id, entity_item->>'role') on conflict do nothing;
        matched_entity_id := null;
      end loop;
      insight_index := insight_index + 1;
    end loop;
  end if;
  insert into public.episode_extractions (episode_id, extraction_version, prompt_version, model, input_tokens, output_tokens, total_tokens, extracted_at)
  values (target_episode_id, target_extraction_version, target_prompt_version, target_model, target_input_tokens, target_output_tokens, target_total_tokens, target_extracted_at);
  return insight_index;
end;
$$;

revoke all on function public.persist_episode_insight_extraction(uuid, text, text, text, integer, integer, integer, timestamptz, jsonb) from public;
grant execute on function public.persist_episode_insight_extraction(uuid, text, text, text, integer, integer, integer, timestamptz, jsonb) to service_role;
