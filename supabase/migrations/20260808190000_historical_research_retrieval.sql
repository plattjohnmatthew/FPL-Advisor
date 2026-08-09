create index insights_full_text_idx on public.insights using gin (
  to_tsvector('english', coalesce(claim, '') || ' ' || coalesce(reasoning, '') || ' ' || coalesce(evidence_text, ''))
);
create index entities_canonical_name_lower_idx on public.entities (lower(canonical_name));
create index sources_name_lower_idx on public.sources (lower(name));

create function public.search_fpl_insights(
  target_player_entities text[] default '{}',
  target_team_entities text[] default '{}',
  target_categories text[] default '{}',
  target_creators text[] default '{}',
  target_date_from timestamptz default null,
  target_date_to timestamptz default null,
  target_gameweeks integer[] default '{}',
  target_search_terms text[] default '{}',
  target_max_results integer default 40,
  target_chronological boolean default false,
  target_current_decision boolean default false,
  target_include_evidence boolean default false
)
returns table (
  insight_id uuid, claim text, reasoning text, primary_category text, recommendation text,
  time_horizon text, creator_confidence text, evidence_text text, timestamp_seconds integer,
  valid_from_gameweek integer, valid_to_gameweek integer, created_at timestamptz,
  episode_id uuid, episode_title text, source_url text, published_at timestamptz, gameweek integer,
  source_id uuid, source_name text, entities jsonb
)
language sql
stable
set search_path = ''
as $$
  with parameters as (
    select
      array(select lower(value) from unnest(target_player_entities || target_team_entities) value) entity_names,
      array(select lower(value) from unnest(target_creators) value) creator_names,
      case when cardinality(target_search_terms) = 0 then null
        else websearch_to_tsquery('english', array_to_string(target_search_terms, ' OR ')) end search_query
  ), candidates as (
    select i.*, e.id selected_episode_id, e.title episode_title_value, e.source_url source_url_value,
      e.published_at published_at_value, e.gameweek episode_gameweek, s.id selected_source_id,
      s.name source_name_value,
      coalesce(jsonb_agg(distinct jsonb_build_object('name', entity.canonical_name, 'type', entity.type))
        filter (where entity.id is not null), '[]'::jsonb) entity_values,
      case when p.search_query is null then 0 else ts_rank(
        to_tsvector('english', coalesce(i.claim, '') || ' ' || coalesce(i.reasoning, '') || ' ' || coalesce(i.evidence_text, '')),
        p.search_query
      ) end text_rank
    from public.insights i
    join public.episodes e on e.id = i.episode_id
    join public.sources s on s.id = e.source_id
    left join public.insight_entities ie on ie.insight_id = i.id
    left join public.entities entity on entity.id = ie.entity_id
    cross join parameters p
    where (cardinality(target_categories) = 0 or i.primary_category = any(target_categories))
      and (cardinality(target_creators) = 0 or lower(s.name) = any(p.creator_names))
      and (target_date_from is null or e.published_at >= target_date_from)
      and (target_date_to is null or e.published_at <= target_date_to)
      and (cardinality(target_gameweeks) = 0 or e.gameweek = any(target_gameweeks)
        or exists (select 1 from unnest(target_gameweeks) gw where gw between i.valid_from_gameweek and i.valid_to_gameweek))
      and (cardinality(p.entity_names) = 0 or exists (
        select 1 from public.insight_entities match_ie join public.entities match_entity on match_entity.id = match_ie.entity_id
        where match_ie.insight_id = i.id and (
          lower(match_entity.canonical_name) = any(p.entity_names)
          or exists (select 1 from unnest(match_entity.aliases) alias where lower(alias) = any(p.entity_names))
        )
      ))
      and (p.search_query is null or to_tsvector('english',
        coalesce(i.claim, '') || ' ' || coalesce(i.reasoning, '') || ' ' || coalesce(i.evidence_text, '')
      ) @@ p.search_query)
    group by i.id, e.id, s.id, p.search_query
  )
  select c.id, c.claim, c.reasoning, c.primary_category, c.recommendation, c.time_horizon,
    c.creator_confidence::text, case when target_include_evidence then c.evidence_text else null end,
    c.timestamp_seconds, c.valid_from_gameweek, c.valid_to_gameweek, c.created_at,
    c.selected_episode_id, c.episode_title_value, c.source_url_value, c.published_at_value,
    c.episode_gameweek, c.selected_source_id, c.source_name_value, c.entity_values
  from candidates c
  order by
    case when target_chronological then c.published_at_value end asc,
    case when not target_chronological then c.text_rank end desc,
    case when target_current_decision then c.published_at_value end desc,
    c.published_at_value desc
  limit least(greatest(target_max_results, 1), 100);
$$;

create function public.search_fpl_split_decisions(
  target_insight_ids uuid[] default '{}',
  target_search_terms text[] default '{}',
  target_split_focus boolean default false,
  target_max_results integer default 20
)
returns table (
  split_decision_id uuid, subject text, question text, primary_category text,
  time_horizon text, unresolved_question text, implication text, positions jsonb
)
language sql
stable
set search_path = ''
as $$
  select sd.id, sd.subject, sd.question, sd.primary_category, sd.time_horizon,
    sd.unresolved_question, sd.implication,
    jsonb_agg(jsonb_build_object(
      'positionId', sp.id, 'position', sp.position, 'reasoning', sp.reasoning,
      'supportingInsightIds', coalesce((select jsonb_agg(spi.insight_id) from public.split_position_insights spi where spi.split_position_id = sp.id), '[]'::jsonb)
    ) order by sp.created_at) positions
  from public.split_decisions sd
  join public.split_positions sp on sp.split_decision_id = sd.id
  where (
      (target_split_focus and cardinality(target_insight_ids) = 0)
      or exists (select 1 from public.split_position_insights spi where spi.split_position_id = sp.id and spi.insight_id = any(target_insight_ids))
    )
    and ((target_split_focus and cardinality(target_insight_ids) = 0) or cardinality(target_search_terms) = 0 or exists (
      select 1 from unnest(target_search_terms) term
      where sd.subject ilike '%' || term || '%' or sd.question ilike '%' || term || '%' or sp.position ilike '%' || term || '%'
    ))
  group by sd.id
  order by count(distinct sp.id) desc, sd.updated_at desc
  limit least(greatest(target_max_results, 1), 50);
$$;

revoke all on function public.search_fpl_insights(text[], text[], text[], text[], timestamptz, timestamptz, integer[], text[], integer, boolean, boolean, boolean) from public;
grant execute on function public.search_fpl_insights(text[], text[], text[], text[], timestamptz, timestamptz, integer[], text[], integer, boolean, boolean, boolean) to service_role;
revoke all on function public.search_fpl_split_decisions(uuid[], text[], boolean, integer) from public;
grant execute on function public.search_fpl_split_decisions(uuid[], text[], boolean, integer) to service_role;
