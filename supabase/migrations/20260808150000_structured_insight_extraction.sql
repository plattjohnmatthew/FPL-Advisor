alter table public.insights
  add column extraction_index integer not null default 0 check (extraction_index >= 0),
  add column tags text[] not null default '{}',
  add column extraction_model text not null default 'legacy' check (btrim(extraction_model) <> ''),
  add column prompt_version text not null default 'legacy' check (btrim(prompt_version) <> '');

alter table public.insights
  add constraint insights_primary_category_taxonomy check (primary_category in ('TRANSFER_DECISION', 'CAPTAINCY', 'FIXTURES', 'MINUTES_AVAILABILITY', 'FORM_UNDERLYING', 'VALUE_MARKET', 'CHIPS_WILDCARD', 'SQUAD_STRUCTURE', 'ROLE_TEAM_CONTEXT')),
  add constraint insights_recommendation_taxonomy check (recommendation in ('BUY', 'SELL', 'HOLD', 'AVOID', 'WATCH', 'CAPTAIN', 'START', 'BENCH', 'NEUTRAL')),
  add constraint insights_time_horizon_taxonomy check (time_horizon in ('IMMEDIATE', 'SHORT', 'MEDIUM', 'SEASONAL'));

create unique index insights_episode_extraction_version_index_key
  on public.insights (episode_id, extraction_version, extraction_index);

create function public.persist_episode_insight_extraction(
  target_episode_id uuid,
  target_extraction_version text,
  target_prompt_version text,
  target_model text,
  extracted_insights jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  insight_item jsonb;
  entity_item jsonb;
  new_insight_id uuid;
  matched_entity_id uuid;
  insight_index integer := 0;
begin
  if jsonb_typeof(extracted_insights) <> 'array' then
    raise exception 'Extracted insights must be a JSON array';
  end if;

  if exists (
    select 1 from public.insights
    where episode_id = target_episode_id and extraction_version = target_extraction_version
  ) then
    return 0;
  end if;

  for insight_item in select value from jsonb_array_elements(extracted_insights)
  loop
    insert into public.insights (
      episode_id, claim, reasoning, primary_category, recommendation, time_horizon,
      creator_confidence, valid_from_gameweek, valid_to_gameweek, evidence_text,
      timestamp_seconds, extraction_version, extraction_index, tags,
      extraction_model, prompt_version
    ) values (
      target_episode_id,
      insight_item->>'claim',
      insight_item->>'reasoning',
      insight_item->>'primaryCategory',
      insight_item->>'recommendation',
      insight_item->>'timeHorizon',
      (insight_item->>'creatorConfidence')::public.creator_confidence,
      (insight_item->>'validFromGameweek')::smallint,
      (insight_item->>'validToGameweek')::smallint,
      insight_item->>'evidenceText',
      (insight_item->>'timestampSeconds')::integer,
      target_extraction_version,
      insight_index,
      array(select jsonb_array_elements_text(insight_item->'tags')),
      target_model,
      target_prompt_version
    ) returning id into new_insight_id;

    for entity_item in select value from jsonb_array_elements(insight_item->'entities')
    loop
      select id into matched_entity_id
      from public.entities
      where type = (entity_item->>'type')::public.entity_type
        and lower(canonical_name) = lower(entity_item->>'canonicalName')
      limit 1;

      if matched_entity_id is null then
        insert into public.entities (type, canonical_name, aliases)
        values (
          (entity_item->>'type')::public.entity_type,
          entity_item->>'canonicalName',
          array(select jsonb_array_elements_text(entity_item->'aliases'))
        )
        returning id into matched_entity_id;
      else
        update public.entities
        set aliases = array(
          select distinct alias_name
          from unnest(aliases || array(select jsonb_array_elements_text(entity_item->'aliases'))) alias_name
          where btrim(alias_name) <> ''
        )
        where id = matched_entity_id;
      end if;

      insert into public.insight_entities (insight_id, entity_id, role)
      values (new_insight_id, matched_entity_id, entity_item->>'role');
      matched_entity_id := null;
    end loop;

    insight_index := insight_index + 1;
  end loop;

  return insight_index;
end;
$$;

revoke all on function public.persist_episode_insight_extraction(uuid, text, text, text, jsonb) from public;
grant execute on function public.persist_episode_insight_extraction(uuid, text, text, text, jsonb) to service_role;
