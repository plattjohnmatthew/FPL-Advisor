create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null references public.transcripts(id) on delete restrict,
  sequence integer not null check (sequence >= 0),
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric check (end_seconds is null or end_seconds >= start_seconds),
  text text not null check (btrim(text) <> ''),
  unique (transcript_id, sequence)
);

create table public.insight_evidence_segments (
  insight_id uuid not null references public.insights(id) on delete restrict,
  transcript_segment_id uuid not null references public.transcript_segments(id) on delete restrict,
  evidence_order integer not null check (evidence_order >= 0),
  primary key (insight_id, transcript_segment_id),
  unique (insight_id, evidence_order)
);

create index transcript_segments_transcript_start_idx on public.transcript_segments (transcript_id, start_seconds);
create index insight_evidence_segments_segment_idx on public.insight_evidence_segments (transcript_segment_id);

alter table public.transcript_segments enable row level security;
alter table public.insight_evidence_segments enable row level security;
grant all on public.transcript_segments, public.insight_evidence_segments to service_role;

insert into public.transcript_segments (transcript_id, sequence, start_seconds, end_seconds, text)
select t.id, segment.ordinality - 1, (segment.value->>'startSeconds')::numeric,
  nullif(segment.value->>'endSeconds', '')::numeric, segment.value->>'text'
from public.transcripts t
cross join lateral jsonb_array_elements(t.segments) with ordinality segment(value, ordinality)
where t.segments is not null
  and jsonb_typeof(segment.value) = 'object'
  and jsonb_typeof(segment.value->'startSeconds') = 'number'
  and jsonb_typeof(segment.value->'text') = 'string'
  and btrim(segment.value->>'text') <> ''
on conflict (transcript_id, sequence) do nothing;

create or replace function public.sync_transcript_segments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.segments is null then return new; end if;
  insert into public.transcript_segments (transcript_id, sequence, start_seconds, end_seconds, text)
  select new.id, segment.ordinality - 1, (segment.value->>'startSeconds')::numeric,
    nullif(segment.value->>'endSeconds', '')::numeric, segment.value->>'text'
  from jsonb_array_elements(new.segments) with ordinality segment(value, ordinality)
  where jsonb_typeof(segment.value) = 'object'
    and jsonb_typeof(segment.value->'startSeconds') = 'number'
    and jsonb_typeof(segment.value->'text') = 'string'
    and btrim(segment.value->>'text') <> ''
  on conflict (transcript_id, sequence) do update set
    start_seconds = excluded.start_seconds, end_seconds = excluded.end_seconds, text = excluded.text;
  return new;
end;
$$;

create trigger transcripts_sync_segments
after insert or update of segments on public.transcripts
for each row execute function public.sync_transcript_segments();

create or replace function public.persist_episode_insight_extraction(
  target_episode_id uuid, target_extraction_version text, target_prompt_version text, target_model text,
  target_input_tokens integer, target_output_tokens integer, target_total_tokens integer,
  target_extracted_at timestamptz, extracted_insights jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  insight_item jsonb; entity_item jsonb; validation_entity jsonb; segment_id_item jsonb;
  new_insight_id uuid; matched_entity_id uuid; stored_segment_id uuid;
  insight_index integer := 0; entity_index integer; evidence_index integer;
begin
  if jsonb_typeof(extracted_insights) is distinct from 'array' then
    raise exception 'Extraction validation failed: episode=% field=insights expected=array received=%', target_episode_id, coalesce(jsonb_typeof(extracted_insights), 'sql-null');
  end if;
  if exists (select 1 from public.episode_extractions where episode_id = target_episode_id and extraction_version = target_extraction_version) then return 0; end if;
  if not exists (select 1 from public.insights where episode_id = target_episode_id and extraction_version = target_extraction_version) then
    for insight_item in select value from jsonb_array_elements(extracted_insights) loop
      if jsonb_typeof(insight_item) is distinct from 'object' then raise exception 'Extraction validation failed: episode=% insight=% field=insight expected=object received=%', target_episode_id, insight_index, coalesce(jsonb_typeof(insight_item), 'sql-null'); end if;
      if jsonb_typeof(insight_item->'tags') is distinct from 'array' then raise exception 'Extraction validation failed: episode=% insight=% field=tags expected=array received=%', target_episode_id, insight_index, coalesce(jsonb_typeof(insight_item->'tags'), 'missing'); end if;
      if jsonb_typeof(insight_item->'entities') is distinct from 'array' then raise exception 'Extraction validation failed: episode=% insight=% field=entities expected=array received=%', target_episode_id, insight_index, coalesce(jsonb_typeof(insight_item->'entities'), 'missing'); end if;
      if jsonb_typeof(coalesce(insight_item->'evidenceSegmentIds', '[]'::jsonb)) is distinct from 'array' then raise exception 'Extraction validation failed: episode=% insight=% field=evidenceSegmentIds expected=array', target_episode_id, insight_index; end if;
      entity_index := 0;
      for validation_entity in select value from jsonb_array_elements(insight_item->'entities') loop
        if jsonb_typeof(validation_entity) is distinct from 'object' then raise exception 'Extraction validation failed: episode=% insight=% field=entities[%] expected=object', target_episode_id, insight_index, entity_index; end if;
        if jsonb_typeof(validation_entity->'aliases') is distinct from 'array' then raise exception 'Extraction validation failed: episode=% insight=% field=entities[%].aliases expected=array', target_episode_id, insight_index, entity_index; end if;
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

      evidence_index := 0;
      for segment_id_item in select value from jsonb_array_elements(coalesce(insight_item->'evidenceSegmentIds', '[]'::jsonb)) loop
        if jsonb_typeof(segment_id_item) <> 'number' then raise exception 'Extraction validation failed: episode=% insight=% field=evidenceSegmentIds[%] expected=integer', target_episode_id, insight_index, evidence_index; end if;
        select ts.id into stored_segment_id from public.transcript_segments ts join public.transcripts t on t.id = ts.transcript_id
        where t.episode_id = target_episode_id and ts.sequence = (segment_id_item #>> '{}')::integer;
        if stored_segment_id is null then raise exception 'Extraction validation failed: episode=% insight=% field=evidenceSegmentIds invalid stored segment ID=%', target_episode_id, insight_index, segment_id_item #>> '{}'; end if;
        insert into public.insight_evidence_segments (insight_id, transcript_segment_id, evidence_order)
        values (new_insight_id, stored_segment_id, evidence_index);
        evidence_index := evidence_index + 1;
      end loop;

      for entity_item in
        select jsonb_build_object('type', entity_type, 'canonicalName', min(canonical_name), 'role', min(entity_role),
          'aliases', coalesce(jsonb_agg(distinct alias_name) filter (where alias_name is not null and btrim(alias_name) <> ''), '[]'::jsonb))
        from (select e->>'type' entity_type, btrim(e->>'canonicalName') canonical_name, btrim(e->>'role') entity_role, a.alias_name
          from jsonb_array_elements(insight_item->'entities') e left join lateral jsonb_array_elements_text(e->'aliases') a(alias_name) on true) normalized
        group by entity_type, lower(canonical_name), lower(entity_role)
      loop
        select id into matched_entity_id from public.entities where type = (entity_item->>'type')::public.entity_type and lower(canonical_name) = lower(entity_item->>'canonicalName') limit 1;
        if matched_entity_id is null then
          insert into public.entities (type, canonical_name, aliases) values ((entity_item->>'type')::public.entity_type, entity_item->>'canonicalName', array(select jsonb_array_elements_text(entity_item->'aliases'))) returning id into matched_entity_id;
        else
          update public.entities set aliases = array(select distinct alias_name from unnest(aliases || array(select jsonb_array_elements_text(entity_item->'aliases'))) alias_name where btrim(alias_name) <> '') where id = matched_entity_id;
        end if;
        insert into public.insight_entities (insight_id, entity_id, role) values (new_insight_id, matched_entity_id, entity_item->>'role') on conflict do nothing;
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
