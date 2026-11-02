create or replace function public.reconcile_entities_with_fpl_registry()
returns integer language plpgsql security definer set search_path = '' as $$
declare player_affected integer := 0; team_affected integer := 0;
begin
  with raw_matches as (
    select e.id entity_id, p.fpl_player_id,
      count(*) over (partition by e.id) entity_match_count,
      row_number() over (partition by p.fpl_player_id order by
        case when public.normalized_fpl_name(e.canonical_name) = public.normalized_fpl_name(p.canonical_name) then 0
             when public.normalized_fpl_name(e.canonical_name) = public.normalized_fpl_name(p.web_name) then 1 else 2 end,
        e.id) player_rank
    from public.entities e join public.fpl_players p on e.type = 'PLAYER' and e.external_fpl_id is null
    and (public.normalized_fpl_name(e.canonical_name) in (public.normalized_fpl_name(p.canonical_name), public.normalized_fpl_name(p.web_name), public.normalized_fpl_name(coalesce(p.known_name,'')), public.normalized_fpl_name(p.first_name || ' ' || p.second_name))
      or exists (select 1 from unnest(e.aliases) a where public.normalized_fpl_name(a) in (public.normalized_fpl_name(p.canonical_name), public.normalized_fpl_name(p.web_name), public.normalized_fpl_name(coalesce(p.known_name,'')), public.normalized_fpl_name(p.first_name || ' ' || p.second_name))))
  ), chosen as (
    select entity_id, fpl_player_id from raw_matches r where entity_match_count = 1 and player_rank = 1
      and not exists (select 1 from public.entities existing where existing.type='PLAYER' and existing.external_fpl_id=r.fpl_player_id)
  )
  update public.entities e set external_fpl_id=c.fpl_player_id, fpl_match_status='RESOLVED' from chosen c where e.id=c.entity_id;
  get diagnostics player_affected = row_count;

  with raw_matches as (
    select e.id entity_id, t.fpl_team_id, count(*) over (partition by e.id) entity_match_count,
      row_number() over (partition by t.fpl_team_id order by case when public.normalized_fpl_name(e.canonical_name)=public.normalized_fpl_name(t.name) then 0 else 1 end, e.id) team_rank
    from public.entities e join public.fpl_teams t on e.type='TEAM' and e.external_fpl_id is null
    and (public.normalized_fpl_name(e.canonical_name) in (public.normalized_fpl_name(t.name),public.normalized_fpl_name(t.short_name))
      or exists (select 1 from unnest(e.aliases) a where public.normalized_fpl_name(a) in (public.normalized_fpl_name(t.name),public.normalized_fpl_name(t.short_name))))
  ), chosen as (
    select entity_id,fpl_team_id from raw_matches r where entity_match_count=1 and team_rank=1
      and not exists (select 1 from public.entities existing where existing.type='TEAM' and existing.external_fpl_id=r.fpl_team_id)
  )
  update public.entities e set external_fpl_id=c.fpl_team_id, fpl_match_status='RESOLVED' from chosen c where e.id=c.entity_id;
  get diagnostics team_affected = row_count;
  return player_affected + team_affected;
end $$;
