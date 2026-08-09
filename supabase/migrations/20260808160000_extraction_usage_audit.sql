create table public.episode_extractions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete restrict,
  extraction_version text not null check (btrim(extraction_version) <> ''),
  prompt_version text not null check (btrim(prompt_version) <> ''),
  model text not null check (btrim(model) <> ''),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  extracted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (episode_id, extraction_version),
  check (
    (input_tokens is null and output_tokens is null and total_tokens is null)
    or (input_tokens is not null and output_tokens is not null and total_tokens is not null)
  )
);

create index episode_extractions_episode_extracted_at_idx
  on public.episode_extractions (episode_id, extracted_at desc);

alter table public.episode_extractions enable row level security;
grant select, insert, update, delete on public.episode_extractions to service_role;

drop function public.persist_episode_insight_extraction(uuid, text, text, text, jsonb);

create function public.persist_episode_insight_extraction(
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
    select 1 from public.episode_extractions
    where episode_id = target_episode_id and extraction_version = target_extraction_version
  ) then
    return 0;
  end if;

  if not exists (
    select 1 from public.insights
    where episode_id = target_episode_id and extraction_version = target_extraction_version
  ) then
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
  end if;

  insert into public.episode_extractions (
    episode_id, extraction_version, prompt_version, model,
    input_tokens, output_tokens, total_tokens, extracted_at
  ) values (
    target_episode_id, target_extraction_version, target_prompt_version, target_model,
    target_input_tokens, target_output_tokens, target_total_tokens, target_extracted_at
  );

  return insight_index;
end;
$$;

revoke all on function public.persist_episode_insight_extraction(uuid, text, text, text, integer, integer, integer, timestamptz, jsonb) from public;
grant execute on function public.persist_episode_insight_extraction(uuid, text, text, text, integer, integer, integer, timestamptz, jsonb) to service_role;
