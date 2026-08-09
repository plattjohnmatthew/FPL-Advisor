create table public.processing_failures (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.processing_runs(id) on delete restrict,
  episode_id uuid references public.episodes(id) on delete restrict,
  stage text not null check (stage in (
    'SOURCE_DISCOVERY', 'TRANSCRIPT_ACQUISITION', 'EXTRACTION', 'EXTRACTION_PERSISTENCE',
    'SPLIT_DECISION_GENERATION', 'RUN_SYNTHESIS', 'RUN_FINALIZATION'
  )),
  error_message text not null check (btrim(error_message) <> ''),
  retryable boolean not null,
  occurred_at timestamptz not null default now()
);

create index processing_failures_run_occurred_idx on public.processing_failures (run_id, occurred_at);
create index processing_failures_episode_idx on public.processing_failures (episode_id) where episode_id is not null;
alter table public.processing_failures enable row level security;
grant select, insert on table public.processing_failures to service_role;

create function public.load_split_detection_context(
  target_run_id uuid,
  target_detection_version text,
  target_new_insight_limit integer default 100,
  target_context_limit integer default 250
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with pending as (
    select i.id, i.created_at
    from public.insights i
    where (
      exists (
        select 1 from public.run_episodes re
        where re.run_id = target_run_id and re.status = 'COMPLETED' and re.episode_id = i.episode_id
      )
      or not exists (
        select 1 from public.split_detection_insights sdi
        where sdi.insight_id = i.id and sdi.detection_version = target_detection_version
      )
    )
    and not exists (
      select 1 from public.split_detection_insights sdi
      where sdi.insight_id = i.id and sdi.detection_version = target_detection_version
    )
    order by i.created_at, i.id
    limit greatest(1, least(target_new_insight_limit, 250))
  ),
  related as (
    select distinct i.id
    from public.insights i
    where i.id in (select id from pending)
       or i.primary_category in (select pi.primary_category from public.insights pi join pending p on p.id = pi.id)
       or exists (
         select 1 from public.insight_entities ie
         where ie.insight_id = i.id and ie.entity_id in (
           select pie.entity_id from public.insight_entities pie join pending p on p.id = pie.insight_id
         )
       )
  ),
  candidates as (
    select i.*, e.source_id, e.title as episode_title, e.published_at, s.name as source_name
    from public.insights i
    join related r on r.id = i.id
    join public.episodes e on e.id = i.episode_id
    join public.sources s on s.id = e.source_id
    order by i.created_at desc, i.id
    limit greatest(1, least(target_context_limit, 500))
  )
  select jsonb_build_object(
    'newInsightIds', coalesce((select jsonb_agg(id order by created_at, id) from pending), '[]'::jsonb),
    'insights', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'sourceId', c.source_id, 'sourceName', c.source_name,
        'episodeId', c.episode_id, 'episodeTitle', c.episode_title, 'publishedAt', c.published_at,
        'claim', c.claim, 'reasoning', c.reasoning, 'primaryCategory', c.primary_category,
        'recommendation', c.recommendation, 'timeHorizon', c.time_horizon,
        'evidenceText', c.evidence_text,
        'entities', coalesce((select jsonb_agg(distinct en.canonical_name) from public.insight_entities ie join public.entities en on en.id = ie.entity_id where ie.insight_id = c.id), '[]'::jsonb)
      ) order by c.created_at desc, c.id)
      from candidates c
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.load_split_detection_context(uuid, text, integer, integer) from public;
grant execute on function public.load_split_detection_context(uuid, text, integer, integer) to service_role;

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
  insight_item jsonb; entity_item jsonb; new_insight_id uuid; matched_entity_id uuid;
  insight_index integer := 0;
begin
  if jsonb_typeof(extracted_insights) <> 'array' then raise exception 'Extracted insights must be a JSON array'; end if;
  if exists (select 1 from public.episode_extractions where episode_id = target_episode_id and extraction_version = target_extraction_version) then return 0; end if;
  if not exists (select 1 from public.insights where episode_id = target_episode_id and extraction_version = target_extraction_version) then
    for insight_item in select value from jsonb_array_elements(extracted_insights) loop
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
          'aliases', jsonb_agg(distinct alias_name) filter (where alias_name is not null and btrim(alias_name) <> '')
        )
        from (
          select e->>'type' entity_type, btrim(e->>'canonicalName') canonical_name, btrim(e->>'role') entity_role, a.alias_name
          from jsonb_array_elements(insight_item->'entities') e
          left join lateral jsonb_array_elements_text(coalesce(e->'aliases', '[]'::jsonb)) a(alias_name) on true
        ) normalized
        group by entity_type, lower(canonical_name), lower(entity_role)
      loop
        select id into matched_entity_id from public.entities
        where type = (entity_item->>'type')::public.entity_type and lower(canonical_name) = lower(entity_item->>'canonicalName') limit 1;
        if matched_entity_id is null then
          insert into public.entities (type, canonical_name, aliases) values (
            (entity_item->>'type')::public.entity_type, entity_item->>'canonicalName',
            array(select jsonb_array_elements_text(coalesce(entity_item->'aliases', '[]'::jsonb)))
          ) returning id into matched_entity_id;
        else
          update public.entities set aliases = array(
            select distinct alias_name from unnest(aliases || array(select jsonb_array_elements_text(coalesce(entity_item->'aliases', '[]'::jsonb)))) alias_name where btrim(alias_name) <> ''
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
